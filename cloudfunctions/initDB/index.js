const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

/**
 * 初始化数据库集合 & 写入数据
 * action: 'init'              — 仅检查/创建集合
 * action: 'setHeroImages'     — 写入 heroImages，参数 images: string[]
 * action: 'setHomeSettings'   — 写入 homeSettings，参数 wifiName, wifiPassword
 * action: 'toggleClosed'      — 切换打烊状态，参数 manualClosed, manualClosedUntil
 * action: 'setShareConfig'    — 写入 share_config，参数 shareTitle, timelineTitle, shareImage, timelineImage, path
 * action: 'addProduct'        — 新增商品，参数 product: object
 * action: 'updateProduct'     — 更新商品，参数 id: string, product: object
 * action: 'deleteProduct'     — 删除商品，参数 id: string
 * action: 'getProducts'       — 获取所有商品（按 sortOrder 排序）
 * action: 'getTables'         — 获取所有桌位
 * action: 'addTable'          — 新增桌位，参数 name: string
 * action: 'updateTable'       — 更新桌位，参数 id: string, name?, enabled?
 * action: 'deleteTable'       — 删除桌位，参数 id: string
 */
exports.main = async (event, context) => {
  const db = cloud.database()
  const action = event.action || 'init'

  // ===== 鉴权：除公开操作外，一律要求店员/管理员白名单 =====
  // 公开操作 = 顾客点单/支付路径 + 幂等的集合初始化
  const PUBLIC_ACTIONS = new Set([
    'init',                 // 幂等：确保集合/初始文档存在
    'getProducts',          // 顾客浏览菜单
    'getFeaturedProducts',  // 顾客首页推荐
    'getTableByCode',       // 顾客扫码进桌
    'getNextPickupNumber',  // 顾客支付时取餐码
    'recordSales',          // 顾客支付后销量累加（幂等）
  ])
  if (!PUBLIC_ACTIONS.has(action)) {
    const openid = cloud.getWXContext().OPENID
    const [staff, admin] = await Promise.all([
      db.collection('staff_whitelist').where({ openid, status: 1 }).limit(1).get().catch(() => ({ data: [] })),
      db.collection('admin_whitelist').where({ openid, status: 1 }).limit(1).get().catch(() => ({ data: [] }))
    ])
    const authorized = (staff.data && staff.data.length > 0) || (admin.data && admin.data.length > 0)
    if (!authorized) return { success: false, message: '无权限' }
  }

  // ===== 英雄区轮播图 =====
  if (action === 'setHeroImages') {
    const images = event.images || []
    try {
      await db.collection('heroImages').doc('config').get()
      await db.collection('heroImages').doc('config').set({ data: { images } })
    } catch (e) {
      await db.collection('heroImages').add({ data: { _id: 'config', images } })
    }
    return { success: true }
  }

  // ===== 首页设置（Wi-Fi 等）=====
  if (action === 'setHomeSettings') {
    const { wifiName, wifiPassword, openingTime, closingTime, closedTitle, closedMessage } = event
    const data = { updateTime: db.serverDate() }
    if (wifiName !== undefined) data.wifiName = wifiName
    if (wifiPassword !== undefined) data.wifiPassword = wifiPassword
    if (openingTime !== undefined) data.openingTime = openingTime
    if (closingTime !== undefined) data.closingTime = closingTime
    if (closedTitle !== undefined) data.closedTitle = closedTitle
    if (closedMessage !== undefined) data.closedMessage = closedMessage
    try {
      await db.collection('homeSettings').doc('config').get()
      await db.collection('homeSettings').doc('config').update({ data })
    } catch (e) {
      await db.collection('homeSettings').add({ data: { _id: 'config', ...data, wifiName: '', wifiPassword: '' } })
    }
    return { success: true }
  }

  // 切换打烊状态
  if (action === 'toggleClosed') {
    const { manualClosed, manualClosedUntil } = event
    const data = { manualClosed, manualClosedUntil: manualClosedUntil || null, manualClosedDate: new Date().toISOString().slice(0, 10), updateTime: db.serverDate() }
    try {
      await db.collection('homeSettings').doc('config').get()
      await db.collection('homeSettings').doc('config').update({ data })
    } catch (e) {
      await db.collection('homeSettings').add({ data: { _id: 'config', ...data } })
    }
    return { success: true }
  }

  // ===== 分享配置 =====
  if (action === 'setShareConfig') {
    const { shareTitle, timelineTitle, shareImage, timelineImage, path } = event
    try {
      await db.collection('share_config').doc('index_share').get()
      await db.collection('share_config').doc('index_share').set({
        data: { shareTitle, timelineTitle, shareImage, timelineImage, path, updateTime: Date.now() }
      })
    } catch (e) {
      await db.collection('share_config').add({
        data: { _id: 'index_share', shareTitle, timelineTitle, shareImage, timelineImage, path, updateTime: Date.now() }
      })
    }
    return { success: true }
  }

  // ===== 商品管理 =====
  if (action === 'addProduct') {
    const product = event.product || {}
    const now = Date.now()
    const res = await db.collection('products').add({
      data: {
        ...product,
        sales: product.sales || 0,
        createdAt: now,
        updatedAt: now
      }
    })
    return { success: true, id: res._id }
  }

  if (action === 'updateProduct') {
    const { id, product } = event
    if (!id) return { success: false, error: 'id 必填' }
    await db.collection('products').doc(id).update({
      data: {
        ...product,
        updatedAt: Date.now()
      }
    })
    return { success: true }
  }

  if (action === 'deleteProduct') {
    const { id } = event
    if (!id) return { success: false, error: 'id 必填' }
    await db.collection('products').doc(id).remove()
    return { success: true }
  }

  if (action === 'createIndexes') {
    // 为 orders 集合创建复合索引 status + createTime
    try {
      await db.collection('orders').createIndex({
        keys: [{ field: 'status', direction: 1 }, { field: 'createTime', direction: 1 }],
        name: 'idx_status_createTime'
      })
    } catch (e) {
      // 索引已存在则忽略
      if (e.errCode !== -502002) throw e
    }
    return { success: true, message: '索引创建完成' }
  }

  if (action === 'getActiveOrders') {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600000)
    const res = await db.collection('orders')
      .where({
        status: db.command.in(['making', 'ready', 'done']),
        createTime: db.command.gte(twoWeeksAgo)
      })
      .orderBy('createTime', 'asc')
      .limit(200)
      .get()
    return { success: true, data: res.data }
  }

  // ===== 店员/管理员更新订单状态（制作中/待取餐/已完成）=====
  // 客户端直写 orders 已被安全规则禁止（update=false），状态变更统一走云函数鉴权
  if (action === 'updateOrderStatus') {
    const { id, status } = event
    if (!id || !status) return { success: false, message: '缺少参数' }
    if (!['making', 'ready', 'done'].includes(status)) return { success: false, message: '非法状态' }
    const data = { status }
    if (status === 'done') data.completeTime = db.serverDate()
    await db.collection('orders').doc(id).update({ data })
    // 回读更新后的订单，供店员端取餐通知使用（客户端直读 orders 已被安全规则收紧）
    let order = null
    try { order = (await db.collection('orders').doc(id).get()).data || null } catch (e) { order = null }
    return { success: true, order }
  }

  // ===== 管理员/店员：读取全量订单（客户端直读已被安全规则收紧，改走云函数鉴权）=====
  if (action === 'getOrders') {
    const sinceDays = Math.min(Math.max(Number(event.sinceDays) || 14, 1), 90)
    const limit = Math.min(Math.max(Number(event.limit) || 1000, 1), 1000)
    const since = new Date(Date.now() - sinceDays * 24 * 3600000)
    const res = await db.collection('orders')
      .where({ createTime: db.command.gte(since) })
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get()
    return { success: true, data: res.data }
  }

  if (action === 'getProducts') {
    const res = await db.collection('products')
      .orderBy('sortOrder', 'asc')
      .orderBy('createdAt', 'asc')
      .limit(200)
      .get()
    // 附带全局拼球价格（公开可读）
    let scoopConfig = { single: 28, double: 38, triple: 45 }
    try {
      const cfg = await db.collection('scoop_config').doc('config').get()
      if (cfg && cfg.data) {
        scoopConfig = {
          single: Number(cfg.data.single) || 28,
          double: Number(cfg.data.double) || 38,
          triple: Number(cfg.data.triple) || 45
        }
      }
    } catch (e) { /* 集合/文档不存在时用默认值 */ }
    return { success: true, data: res.data, scoopConfig }
  }

  // ===== 全局拼球价格（单球/双球/三球，全局一份，后台可改）=====
  if (action === 'setScoopConfig') {
    const single = Number(event.single)
    const double = Number(event.double)
    const triple = Number(event.triple)
    const data = {
      single: single > 0 ? single : 28,
      double: double > 0 ? double : 38,
      triple: triple > 0 ? triple : 45,
      updateTime: db.serverDate()
    }
    try {
      await db.collection('scoop_config').doc('config').get()
      await db.collection('scoop_config').doc('config').update({ data })
    } catch (e) {
      await db.collection('scoop_config').add({ data: { _id: 'config', ...data } })
    }
    return { success: true, scoopConfig: data }
  }

  // ===== 取餐码：服务端按天顺序生成唯一码（堂食 T01/T02… / 外带 K01/K02…）=====
  if (action === 'getNextPickupNumber') {
    const orderType = event.orderType === 'takeaway' ? 'takeaway' : 'dine-in'
    const prefix = orderType === 'dine-in' ? 'T' : 'K'
    const day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10) // 北京时间按天
    const key = `${day}_${orderType}`
    let seq = 0
    try {
      await db.runTransaction(async transaction => {
        const ref = transaction.collection('pickup_counter').doc(key)
        let n = 1
        try {
          const doc = await ref.get()
          n = ((doc.data && doc.data.seq) || 0) + 1
        } catch (e) {
          // 仅「文档不存在」才从 1 开始；瞬态错误抛出让事务重试，防止 seq 重置撞号
          const msg = String((e && (e.errMsg || e.message)) || '')
          const isNotFound = /not exist|不存在|not found/i.test(msg) || (e && e.errCode === -502004)
          if (!isNotFound) throw e
          n = 1
        }
        await ref.set({ data: { seq: n, orderType } })
        seq = n
      })
      return { success: true, pickupNumber: prefix + String(seq).padStart(2, '0') }
    } catch (e) {
      console.warn('[getNextPickupNumber] 顺序计数失败，使用随机码兜底:', e.message)
      const letters = 'ABCDEFGH'
      const fallback = prefix + letters[Math.floor(Math.random() * letters.length)] +
        String(Math.floor(Math.random() * 99) + 1).padStart(2, '0')
      return { success: true, pickupNumber: fallback }
    }
  }

  // ===== 销量累加（支付成功后调用，幂等靠订单 salesCounted 标志）=====
  if (action === 'recordSales') {
    const orderIds = event.orderIds || []
    const _ = db.command
    let counted = 0
    for (const orderId of orderIds) {
      try {
        const order = (await db.collection('orders').doc(orderId).get()).data
        if (!order || order.salesCounted) continue   // 幂等：已计过则跳过
        for (const p of (order.products || [])) {
          if (!p.productId) continue
          await db.collection('products').doc(p.productId)
            .update({ data: { sales: _.inc(p.quantity || 1) } })
        }
        await db.collection('orders').doc(orderId)
          .update({ data: { salesCounted: true } })
        counted++
      } catch (e) {
        // 单条失败不影响整体
      }
    }
    return { success: true, counted }
  }

  // ===== 历史销量按名称尽力回填（一次性，部署后手动触发）=====
  if (action === 'backfillSales') {
    const products = (await db.collection('products').limit(1000).get()).data || []
    // 已支付订单（排除 pending 未支付）；退款不回退，故含 refunded
    const orders = (await db.collection('orders')
      .where({ status: db.command.neq('pending') }).limit(1000).get()).data || []
    const nameMap = {}
    orders.forEach(o => (o.products || []).forEach(p => {
      if (p.name) nameMap[p.name] = (nameMap[p.name] || 0) + (p.quantity || 1)
    }))
    let updated = 0
    for (const p of products) {
      await db.collection('products').doc(p._id)
        .update({ data: { sales: nameMap[p.name] || 0 } })
      updated++
    }
    return { success: true, updated, matched: Object.keys(nameMap).length }
  }

  // 批量更新商品排序
  if (action === 'updateSortOrder') {
    const updates = event.updates || []
    for (const item of updates) {
      await db.collection('products').doc(item._id).update({
        data: { sortOrder: item.sortOrder }
      })
    }
    return { success: true, updated: updates.length }
  }

  // ===== 首页商品展示 =====
  if (action === 'getFeaturedProducts') {
    try {
      const res = await db.collection('featuredProducts').doc('config').get()
      const items = res.data.items || []
      // 同时查出商品名称（仅上架商品，下架商品不展示）
      const productIds = items.map(i => i.productId).filter(Boolean)
      let nameMap = {}
      if (productIds.length > 0) {
        const prodRes = await db.collection('products').where({
          _id: db.command.in(productIds),
          saleStatus: 'on'
        }).limit(100).get()
        ;(prodRes.data || []).forEach(p => { nameMap[p._id] = p.name })
      }
      // 只保留在架商品（nameMap 命中才返回）
      return {
        success: true,
        data: items
          .filter(item => nameMap[item.productId] !== undefined)
          .map(item => ({
            ...item,
            name: nameMap[item.productId] || '',
          })),
      }
    } catch (e) {
      if (e.errCode === -502005) {
        return { success: true, data: [] }
      }
      throw e
    }
  }

  if (action === 'setFeaturedProducts') {
    const items = event.items || []
    try {
      await db.collection('featuredProducts').doc('config').get()
      await db.collection('featuredProducts').doc('config').set({
        data: { items, updateTime: db.serverDate() }
      })
    } catch (e) {
      // 集合或文档不存在时创建
      if (e.errCode === -502005) {
        await db.createCollection('featuredProducts')
      }
      await db.collection('featuredProducts').add({
        data: { _id: 'config', items, updateTime: db.serverDate() }
      })
    }
    return { success: true }
  }

  // ===== 桌面点单二维码管理 =====
  if (action === 'getTableByCode') {
    const { code } = event
    if (!code) return { success: false, data: null, message: '缺少 code' }
    try {
      const res = await db.collection('tables').where({ code, enabled: true }).limit(1).get()
      if (res.data && res.data.length > 0) {
        return { success: true, data: res.data[0] }
      }
      return { success: true, data: null }
    } catch (e) {
      if (e.errCode === -502005) return { success: true, data: null }
      throw e
    }
  }

  if (action === 'getTables') {
    try {
      const res = await db.collection('tables')
        .where({ code: db.command.neq('') })
        .orderBy('createdAt', 'asc')
        .limit(200)
        .get()
      return { success: true, data: res.data }
    } catch (e) {
      if (e.errCode === -502005) {
        return { success: true, data: [] }
      }
      throw e
    }
  }

  if (action === 'addTable') {
    const { name } = event
    if (!name || !name.trim()) {
      return { success: false, message: '请输入桌位名称' }
    }
    // 生成 6 位 base36 随机码
    let code
    for (let i = 0; i < 5; i++) {
      code = Math.random().toString(36).slice(2, 8)
      const dup = await db.collection('tables').where({ code }).limit(1).get()
      if (dup.data.length === 0) break
    }
    const now = Date.now()
    const res = await db.collection('tables').add({
      data: {
        name: name.trim(),
        code: code,
        qrFileID: '',
        enabled: true,
        createdAt: now,
        updatedAt: now
      }
    })
    return { success: true, id: res._id, code: code }
  }

  if (action === 'updateTable') {
    const { id, name, enabled } = event
    if (!id) return { success: false, message: '缺少参数 id' }
    const updateData = { updatedAt: Date.now() }
    if (name !== undefined) updateData.name = name.trim()
    if (enabled !== undefined) updateData.enabled = !!enabled
    await db.collection('tables').doc(id).update({ data: updateData })
    return { success: true }
  }

  if (action === 'deleteTable') {
    const { id } = event
    if (!id) return { success: false, message: '缺少参数 id' }
    // 读取 doc 获取 qrFileID，用于删除云存储文件
    try {
      const doc = await db.collection('tables').doc(id).get()
      if (doc.data && doc.data.qrFileID) {
        try {
          await cloud.deleteFile({ fileList: [doc.data.qrFileID] })
        } catch (e) {
          console.warn('[initDB] 删除 QR 云存储文件失败（忽略）:', e.message)
        }
      }
    } catch (e) {
      // doc 不存在也会抛错，直接尝试删集合中的 doc
    }
    await db.collection('tables').doc(id).remove()
    return { success: true }
  }

  // ===== init：确保集合和初始文档存在 =====
  const ensureCollection = async (name, initialData) => {
    try {
      await db.collection(name).limit(1).get()
    } catch (e) {
      // 集合不存在时先创建集合，再写入初始数据
      if (e.errCode === -502005) {
        await db.createCollection(name)
        await db.collection(name).add({ data: initialData })
      } else {
        await db.collection(name).add({ data: initialData })
      }
    }
  }
  await ensureCollection('heroImages', { _id: 'config', images: [] })
  await ensureCollection('featuredProducts', { _id: 'config', items: [] })
  await ensureCollection('scoop_config', { _id: 'config', single: 28, double: 38, triple: 45 })
  await ensureCollection('staff_heartbeat', { _id: '_placeholder', openid: '_placeholder', lastSeen: new Date() })
  await ensureCollection('tables', { _id: '_placeholder', name: '', code: '', qrFileID: '', enabled: true, createdAt: Date.now(), updatedAt: Date.now() })
  await ensureCollection('pickup_counter', { _id: '_placeholder', seq: 0 })
  await ensureCollection('table_sessions', { _id: '_placeholder', tableId: '', items: [], members: {}, status: 'open' })
  await ensureCollection('order_events', { _id: 'latest', ts: Date.now(), orderId: '' })
  return { success: true, action: 'init' }
}
