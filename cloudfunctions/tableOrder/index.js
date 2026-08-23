// 云函数 - 桌位共享桌单（多人拼单、一起付/分开付、独立取餐码）
const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

const db = cloud.database()

// 心跳超时：超过该时长无心跳视为"已离场"，用于换桌判定（毫秒）
const HEARTBEAT_TIMEOUT = 90 * 1000
// 结算锁超时：超过该时长仍在 paying 视为支付卡死，自动恢复（毫秒）
const PAYING_TIMEOUT = 5 * 60 * 1000

function beijingDay() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

// 条目状态：旧数据无 state 字段默认 pending
function stateOf(i) {
  return i && i.state ? i.state : 'pending'
}

// 表级 status = 派生汇总（条目级 state 才是权威锁）
function deriveStatus(items) {
  const arr = items || []
  if (arr.some(i => stateOf(i) === 'paying')) return 'paying'
  if (arr.some(i => stateOf(i) === 'pending')) return 'open'
  if (arr.length > 0) return 'paid'
  return 'open'
}

// 待支付/某状态合计
function sumState(items, state) {
  return parseFloat((items || [])
    .filter(i => stateOf(i) === state)
    .reduce((s, i) => s + (Number(i.price) || 0) * (i.qty || 1), 0)
    .toFixed(2))
}

function freshSession(tableId, tableName, openid, now) {
  return {
    tableId,
    tableName: tableName || '',
    items: [],
    members: { [openid]: now },
    status: 'open',
    pickupNumber: '',
    orderId: '',
    payingOpenid: '',
    payingAt: null,
    totalAmount: 0,
    completedOrders: [],
    updatedAt: now,
  }
}

function fail(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

// 释放过期结算锁（支付超时/卡死）。释放前查 lockOrderId 对应订单，防止误释放"实际已付"的锁。
async function recoverStaleLocks(t, s, now) {
  if (!s || !s.items) return
  for (const it of s.items) {
    if (stateOf(it) === 'paying' && it.lockOpenid && (now - (it.lockAt || 0)) > PAYING_TIMEOUT) {
      // 无订单回写（bind 失败）时无法核实支付状态：不释放，留给 webhook 的 uid 路径或店员清台收尾，
      // 避免误释放「实际已付但 webhook 延迟」的锁导致重复买单
      if (!it.lockOrderId) continue
      let paid = false
      try {
        const o = await t.collection('orders').doc(it.lockOrderId).get()
        const d = o && o.data
        // 已付判据：状态非 pending，或已有微信交易单号（webhook 写入）——本地 status 可能因 webhook 延迟而滞后
        paid = !!(d && ((d.status && d.status !== 'pending') || d.transactionId))
      } catch (e) { /* 订单不存在 → 视为未付 */ }
      if (!paid) {
        it.state = 'pending'
        it.lockOpenid = ''
        it.lockAt = 0
        it.lockOrderId = ''
      }
    }
  }
}

// 原子递增取餐码（与条目锁定同一事务，保证 T01/T02… 全局顺序）
async function takePickupNumber(t, orderType) {
  const type = orderType === 'takeaway' ? 'takeaway' : 'dine-in'
  const key = `${beijingDay()}_${type}`
  const counterRef = t.collection('pickup_counter').doc(key)
  let n = 1
  try {
    const c = await counterRef.get()
    n = ((c.data && c.data.seq) || 0) + 1
  } catch (e) {
    // 仅「文档不存在」才从 1 开始；限流/抖动等瞬态错误抛出让事务重试，防止把当日码打回 T01 撞号
    const msg = String((e && (e.errMsg || e.message)) || '')
    const isNotFound = /not exist|不存在|not found/i.test(msg) || (e && e.errCode === -502004)
    if (!isNotFound) throw e
    n = 1
  }
  await counterRef.set({ data: { seq: n, orderType: type } })
  return (type === 'dine-in' ? 'T' : 'K') + String(n).padStart(2, '0')
}

// 把匹配条目置为已下单，返回 completedOrders 记录
function finalizePaid(matched, openid, orderId, pn, now) {
  const amount = parseFloat(matched.reduce((s, i) => s + (Number(i.price) || 0) * (i.qty || 1), 0).toFixed(2))
  const itemCount = matched.reduce((n, i) => n + (i.qty || 1), 0)
  for (const it of matched) {
    it.state = 'paid'
    it.paidOrderId = orderId
    it.paidPickupNumber = pn || ''
    it.paidAt = now
    it.lockOpenid = ''
    it.lockAt = 0
    it.lockOrderId = ''
  }
  return { orderId, pickupNumber: pn || '', paidBy: openid, amount, itemCount, createdAt: now }
}

// 结算快照（返回给客户端建订单，只回传需要的字段）
function snapshotItems(items) {
  return items.map(i => ({
    uid: i.uid, productId: i.productId, name: i.name,
    price: i.price, spec: i.spec, temperature: i.temperature, qty: i.qty, addedBy: i.addedBy,
  }))
}

exports.main = async (event, context) => {
  const action = event.action
  const openid = cloud.getWXContext().OPENID
  if (!openid) return { success: false, code: 'NO_OPENID', message: '未获取到用户身份' }

  const tableId = event.tableId
  if (!tableId) return { success: false, code: 'NO_TABLE', message: '缺少桌位信息' }

  try {
    // ===== 加入桌单（扫码进入）=====
    if (action === 'joinTableSession') {
      const now = Date.now()
      let result = { reset: false, session: null }
      await db.runTransaction(async t => {
        const ref = t.collection('table_sessions').doc(tableId)
        let s = null
        try {
          s = (await ref.get()).data
        } catch (e) {
          s = null
        }
        // 老成员标记（用原始 members 判断，避免"回来"被误判成新客）
        const wasMember = !!(s && s.members && Object.prototype.hasOwnProperty.call(s.members, openid))

        // 清理过期成员
        let members = {}
        if (s && s.members) {
          for (const k in s.members) {
            if (now - (s.members[k] || 0) <= HEARTBEAT_TIMEOUT) members[k] = s.members[k]
          }
        }

        // 恢复过期结算锁（不再因 status==='paying' 整桌重置，避免误清他人 pending）
        if (s && s.items) await recoverStaleLocks(t, s, now)

        const derived = s ? deriveStatus(s.items) : 'open'
        let reset = false
        if (!s || !s.status) {
          reset = true
        } else if (derived === 'paid') {
          reset = true
        } else if (derived === 'open' && Object.keys(members).length === 0 && !wasMember) {
          reset = true
        }

        let session
        if (reset) {
          session = freshSession(tableId, event.tableName, openid, now)
        } else {
          members[openid] = now
          session = Object.assign({}, s, { members, status: derived, updatedAt: now })
        }
        await ref.set({ data: session })
        result = { reset, session }
      })
      return { success: true, reset: result.reset, session: result.session }
    }

    // ===== 心跳：刷新本人在场时间 =====
    if (action === 'tableHeartbeat') {
      const now = Date.now()
      try {
        await db.collection('table_sessions').doc(tableId).update({
          data: { [`members.${openid}`]: now, updatedAt: now }
        })
      } catch (e) {
        // 桌单不存在时忽略，等待 join 创建
      }
      return { success: true }
    }

    // ===== 读取当前桌单（清理过期成员后返回）=====
    if (action === 'getTableSession') {
      const now = Date.now()
      let s = null
      try {
        s = (await db.collection('table_sessions').doc(tableId).get()).data
      } catch (e) {
        s = null
      }
      if (!s || !s.status) {
        return { success: true, session: freshSession(tableId, event.tableName, openid, now) }
      }
      const members = {}
      if (s.members) {
        for (const k in s.members) {
          if (now - (s.members[k] || 0) <= HEARTBEAT_TIMEOUT) members[k] = s.members[k]
        }
      }
      return { success: true, session: Object.assign({}, s, { members }) }
    }

    // ===== 加菜到共享桌单（同人同品同规格合并，不同人分行）=====
    if (action === 'addTableItem') {
      const item = event.item || {}
      const productId = item.productId
      if (!productId) return { success: false, code: 'NO_PRODUCT', message: '缺少商品信息' }

      // 服务端以商品库价格/名称为准，防篡改
      let product = null
      try {
        product = (await db.collection('products').doc(productId).get()).data
      } catch (e) {
        product = null
      }
      let price = product ? Number(product.price) || 0 : (Number(item.price) || 0)
      const name = product ? product.name : item.name
      const image = product ? (product.imageURL || product.image || '') : (item.image || '')
      const category = product ? (product.category || '') : (item.category || '')
      const spec = item.spec || ''
      const temperature = item.temperature || ''
      // 可拼球商品：按球数取全局拼球价（服务端权威，防篡改）
      const scoopCount = Number(item.scoopCount) || 0
      if (product && product.category === 'icecream' && scoopCount >= 1 && scoopCount <= 3) {
        try {
          const cfg = await db.collection('scoop_config').doc('config').get()
          const d = cfg && cfg.data
          const map = { 1: 'single', 2: 'double', 3: 'triple' }
          const key = map[scoopCount]
          if (d && key && Number(d[key]) > 0) price = Number(d[key])
        } catch (e) { /* 读不到用主价 */ }
      }
      const uid = `${productId}_${spec}_${openid}`  // 追加归属，同人同品同规格合并、不同人分行

      let result = null
      await db.runTransaction(async t => {
        const ref = t.collection('table_sessions').doc(tableId)
        const doc = await ref.get()
        const s = doc.data
        const now = Date.now()
        await recoverStaleLocks(t, s, now)
        if (deriveStatus(s.items) === 'paid') throw fail('PAID', '本桌已下单')

        const items = (s.items || []).slice()
        const existing = items.find(i => i.uid === uid && stateOf(i) === 'pending')
        if (existing) {
          existing.qty = (existing.qty || 1) + 1
        } else {
          items.push({
            uid, addedBy: openid, productId, name, price, image, category, spec, temperature, qty: 1,
            state: 'pending', lockOpenid: '', lockAt: 0, lockOrderId: '',
            paidOrderId: '', paidAt: 0,
          })
        }
        const members = Object.assign({}, s.members || {}, { [openid]: now })
        await ref.update({ data: { items, members, status: deriveStatus(items), totalAmount: sumState(items, 'pending'), updatedAt: now } })
        result = { items, totalAmount: sumState(items, 'pending') }
      })
      return { success: true, items: result.items, totalAmount: result.totalAmount }
    }

    // ===== 修改数量（绝对值；<=0 移除，仅本人待支付条目）=====
    if (action === 'updateTableItemQty') {
      const uid = event.uid
      const qty = Number(event.qty) || 0
      if (!uid) return { success: false, code: 'NO_UID', message: '缺少条目标识' }
      let result = null
      await db.runTransaction(async t => {
        const ref = t.collection('table_sessions').doc(tableId)
        const doc = await ref.get()
        const s = doc.data
        const now = Date.now()
        await recoverStaleLocks(t, s, now)

        const items = (s.items || []).slice()
        const idx = items.findIndex(i => i.uid === uid)
        if (idx >= 0) {
          const it = items[idx]
          if (stateOf(it) !== 'pending') throw fail('LOCKED', '该条目正在结算或已下单，不可修改')
          if (it.addedBy !== openid) throw fail('FORBIDDEN', '只能修改自己点的商品')
          if (qty <= 0) items.splice(idx, 1)
          else it.qty = qty
        }
        const members = Object.assign({}, s.members || {}, { [openid]: now })
        await ref.update({ data: { items, members, status: deriveStatus(items), totalAmount: sumState(items, 'pending'), updatedAt: now } })
        result = { items, totalAmount: sumState(items, 'pending') }
      })
      return { success: true, items: result.items, totalAmount: result.totalAmount }
    }

    // ===== 删除某一条目（仅本人待支付条目）=====
    if (action === 'removeTableItem') {
      const uid = event.uid
      if (!uid) return { success: false, code: 'NO_UID', message: '缺少条目标识' }
      let result = null
      await db.runTransaction(async t => {
        const ref = t.collection('table_sessions').doc(tableId)
        const doc = await ref.get()
        const s = doc.data
        const now = Date.now()
        await recoverStaleLocks(t, s, now)

        const items = (s.items || []).slice()
        const idx = items.findIndex(i => i.uid === uid)
        if (idx >= 0) {
          const it = items[idx]
          if (stateOf(it) !== 'pending') throw fail('LOCKED', '该条目正在结算或已下单，不可修改')
          if (it.addedBy !== openid) throw fail('FORBIDDEN', '只能修改自己点的商品')
          items.splice(idx, 1)
        }
        const members = Object.assign({}, s.members || {}, { [openid]: now })
        await ref.update({ data: { items, members, status: deriveStatus(items), totalAmount: sumState(items, 'pending'), updatedAt: now } })
        result = { items, totalAmount: sumState(items, 'pending') }
      })
      return { success: true, items: result.items, totalAmount: result.totalAmount }
    }

    // ===== 一起付：锁定所有待支付条目 + 分配取餐码 + 服务端算总额 =====
    if (action === 'startTableCheckout') {
      let checkout = null
      await db.runTransaction(async t => {
        const ref = t.collection('table_sessions').doc(tableId)
        const doc = await ref.get()
        const s = doc.data
        const now = Date.now()
        await recoverStaleLocks(t, s, now)

        const items = (s.items || []).slice()
        // 一起付 = "包圆"，拒绝他人正在结算（定稿规则）
        const otherPaying = items.find(i => stateOf(i) === 'paying' && i.lockOpenid && i.lockOpenid !== openid)
        if (otherPaying) throw fail('PAYING', '有人正在结算中，请稍后或选择分开付')

        // 自己已有在途结算锁：拒绝继续一起付，避免「漏掉自己已锁条目、只付他人」的错账
        const selfPaying = items.find(i => stateOf(i) === 'paying' && i.lockOpenid === openid)
        if (selfPaying) throw fail('SELF_PAYING', '你有正在结算的点单，请先完成或取消当前结算')

        const pending = items.filter(i => stateOf(i) === 'pending')
        if (pending.length === 0) throw fail('EMPTY', '本桌没有待支付的点单')

        const snapshot = snapshotItems(pending)
        const totalAmount = parseFloat(snapshot.reduce((s, i) => s + (Number(i.price) || 0) * (i.qty || 1), 0).toFixed(2))
        const memberOpenids = Object.keys(s.members || {}).filter(k => (now - (s.members[k] || 0)) <= HEARTBEAT_TIMEOUT)
        if (!memberOpenids.includes(openid)) memberOpenids.push(openid)

        const pickupNumber = await takePickupNumber(t, 'dine-in')

        for (const it of pending) {
          it.state = 'paying'
          it.lockOpenid = openid
          it.lockAt = now
          it.lockOrderId = ''
        }
        await ref.update({ data: { items, status: deriveStatus(items), totalAmount: sumState(items, 'pending'), updatedAt: now } })
        checkout = { items: snapshot, totalAmount, pickupNumber, memberOpenids }
      })
      return {
        success: true, mode: 'together',
        items: checkout.items, totalAmount: checkout.totalAmount,
        pickupNumber: checkout.pickupNumber, memberOpenids: checkout.memberOpenids,
      }
    }

    // ===== 分开付：锁定本人待支付条目 + 分配取餐码 + 服务端算总额 =====
    if (action === 'startSplitCheckout') {
      let checkout = null
      await db.runTransaction(async t => {
        const ref = t.collection('table_sessions').doc(tableId)
        const doc = await ref.get()
        const s = doc.data
        const now = Date.now()
        await recoverStaleLocks(t, s, now)

        const items = (s.items || []).slice()
        const mine = items.filter(i => stateOf(i) === 'pending' && i.addedBy === openid)
        if (mine.length === 0) throw fail('EMPTY', '你没有待支付的点单')

        const snapshot = snapshotItems(mine)
        const totalAmount = parseFloat(snapshot.reduce((s, i) => s + (Number(i.price) || 0) * (i.qty || 1), 0).toFixed(2))
        const pickupNumber = await takePickupNumber(t, 'dine-in')

        for (const it of mine) {
          it.state = 'paying'
          it.lockOpenid = openid
          it.lockAt = now
          it.lockOrderId = ''
        }
        await ref.update({ data: { items, status: deriveStatus(items), totalAmount: sumState(items, 'pending'), updatedAt: now } })
        checkout = { items: snapshot, totalAmount, pickupNumber, uidList: snapshot.map(i => i.uid) }
      })
      return {
        success: true, mode: 'split',
        items: checkout.items, totalAmount: checkout.totalAmount,
        pickupNumber: checkout.pickupNumber, uidList: checkout.uidList,
      }
    }

    // ===== 回写结算锁对应订单 id（供超时恢复/幂等判断）=====
    if (action === 'bindTableCheckout') {
      const orderId = event.orderId || ''
      if (!orderId) return { success: false, code: 'NO_ORDER', message: '缺少订单 id' }
      await db.runTransaction(async t => {
        const ref = t.collection('table_sessions').doc(tableId)
        const doc = await ref.get()
        const s = doc.data
        const now = Date.now()
        const items = (s.items || []).slice()
        let changed = false
        for (const it of items) {
          if (stateOf(it) === 'paying' && it.lockOpenid === openid && !it.lockOrderId) {
            it.lockOrderId = orderId
            changed = true
          }
        }
        if (changed) await ref.update({ data: { items, updatedAt: now } })
      })
      return { success: true }
    }

    // ===== 支付成功：把本人锁定的条目置已下单（一起付/分开付共用，幂等）=====
    // 服务端校验支付：查微信真实交易状态（不信任客户端可写的 orders 字段），防伪造免费单
    if (action === 'completeTableCheckout' || action === 'completeSplitCheckout') {
      const orderId = event.orderId || ''
      if (!orderId) return { success: false, code: 'NO_ORDER', message: '缺少订单 id' }

      // 查微信真实状态确认已支付（createPayment 已内置 v3 查单能力）
      let transactionId = ''
      try {
        const q = await cloud.callFunction({ name: 'createPayment', data: { action: 'query', outTradeNo: orderId } })
        const r = (q && q.result) || {}
        if (r.tradeState !== 'SUCCESS') {
          return { success: false, code: 'NOT_PAID', message: '支付未确认，请稍后刷新' }
        }
        transactionId = r.transactionId || ''
      } catch (e) {
        // 查单失败：无法确认，拒绝完成，等 webhook 收尾（不标记 paid，防误标/防伪造）
        return { success: false, code: 'NOT_PAID', message: '支付未确认，请稍后刷新' }
      }

      await db.runTransaction(async t => {
        const ref = t.collection('table_sessions').doc(tableId)
        const doc = await ref.get()
        const s = doc.data
        const now = Date.now()
        const items = (s.items || []).slice()
        const completedOrders = (s.completedOrders || []).slice()

        // 幂等：该订单已记录则跳过
        if (orderId && completedOrders.some(c => c.orderId === orderId)) return

        const matched = items.filter(i => stateOf(i) === 'paying' && i.lockOpenid === openid)
        if (matched.length === 0) return  // 无匹配（webhook 可能已处理）

        let pn = ''
        try {
          const o = await t.collection('orders').doc(orderId).get()
          pn = (o.data && o.data.pickupNumber) || ''
        } catch (e) { /* 忽略 */ }

        completedOrders.push(finalizePaid(matched, openid, orderId, pn, now))
        await ref.update({ data: { items, completedOrders, status: deriveStatus(items), totalAmount: sumState(items, 'pending'), updatedAt: now } })

        // 服务端权威写订单状态（替代客户端直写 orders，防伪造 making）
        try {
          await t.collection('orders').doc(orderId).update({
            data: { status: 'making', transactionId, paidAt: db.serverDate() }
          })
        } catch (e) { /* 订单写失败不阻塞，webhook 会兜底 */ }
      })
      return { success: true }
    }

    // ===== 取消/失败：释放结算锁（带 orderId 时，若订单已付则转完成逻辑）=====
    if (action === 'releaseTableCheckout' || action === 'releaseSplitCheckout') {
      const orderId = event.orderId || ''
      await db.runTransaction(async t => {
        const ref = t.collection('table_sessions').doc(tableId)
        const doc = await ref.get()
        const s = doc.data
        const now = Date.now()
        const items = (s.items || []).slice()
        const completedOrders = (s.completedOrders || []).slice()

        // 订单已付 → 转完成逻辑（webhook 已收单但客户端误报取消）
        let orderPaid = false
        if (orderId) {
          try {
            const o = await t.collection('orders').doc(orderId).get()
            const d = o && o.data
            orderPaid = !!(d && ((d.status && d.status !== 'pending') || d.transactionId))
          } catch (e) { /* 订单不存在 → 未付 */ }
        }
        if (orderPaid) {
          if (orderId && completedOrders.some(c => c.orderId === orderId)) return
          const matched = items.filter(i => stateOf(i) === 'paying' && i.lockOpenid === openid)
          if (matched.length === 0) return
          let pn = ''
          try { const o = await t.collection('orders').doc(orderId).get(); pn = (o.data && o.data.pickupNumber) || '' } catch (e) {}
          completedOrders.push(finalizePaid(matched, openid, orderId, pn, now))
          await ref.update({ data: { items, completedOrders, status: deriveStatus(items), totalAmount: sumState(items, 'pending'), updatedAt: now } })
          return
        }

        // 正常释放：只释放本人锁定的 paying 条目
        let changed = false
        for (const it of items) {
          if (stateOf(it) === 'paying' && it.lockOpenid === openid) {
            it.state = 'pending'
            it.lockOpenid = ''
            it.lockAt = 0
            it.lockOrderId = ''
            changed = true
          }
        }
        if (changed) {
          await ref.update({ data: { items, status: deriveStatus(items), totalAmount: sumState(items, 'pending'), updatedAt: now } })
        }
        // 注意：不删订单。订单可能「已扣款但 webhook 未到」，此刻本地 status 仍是 pending，
        // 若删除会令已付款订单凭空消失；未付的 pending 订单由订单页过滤不展示，留待后台清理。
      })
      return { success: true }
    }

    // ===== 清台：强制重置桌单（仅店员/管理员），无论 open/paying/paid =====
    if (action === 'clearTableSession') {
      const [staff, admin] = await Promise.all([
        db.collection('staff_whitelist').where({ openid, status: 1 }).limit(1).get().catch(() => ({ data: [] })),
        db.collection('admin_whitelist').where({ openid, status: 1 }).limit(1).get().catch(() => ({ data: [] }))
      ])
      const authorized = (staff.data && staff.data.length > 0) || (admin.data && admin.data.length > 0)
      if (!authorized) return { success: false, code: 'FORBIDDEN', message: '无权限' }

      const now = Date.now()
      let tableName = event.tableName || ''
      await db.runTransaction(async t => {
        const ref = t.collection('table_sessions').doc(tableId)
        let s = null
        try { s = (await ref.get()).data } catch (e) { s = null }
        if (s && s.tableName) tableName = s.tableName
        await ref.set({
          data: {
            tableId,
            tableName,
            items: [],
            members: {},
            status: 'open',
            pickupNumber: '',
            orderId: '',
            payingOpenid: '',
            payingAt: null,
            totalAmount: 0,
            completedOrders: [],
            updatedAt: now
          }
        })
      })
      return { success: true }
    }

    return { success: false, code: 'UNKNOWN', message: '未知操作' }
  } catch (e) {
    console.warn('[tableOrder] 操作失败:', action, e.message)
    return { success: false, code: e.code || 'ERROR', message: e.message || '操作失败' }
  }
}
