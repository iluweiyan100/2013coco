// 云函数回调 - 微信支付 v3 回调处理
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

// AES-256-GCM 解密回调数据
function decryptResource(apiKeyV3, resource) {
  const { ciphertext, nonce, associated_data } = resource
  const key = Buffer.from(apiKeyV3, 'utf8') // 32字节
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(Buffer.from(ciphertext, 'base64').slice(-16))
  decipher.setAAD(Buffer.from(associated_data || ''))

  const ciphertextBuf = Buffer.from(ciphertext, 'base64').slice(0, -16)
  let decrypted = decipher.update(ciphertextBuf, null, 'utf8')
  decrypted += decipher.final('utf8')
  return JSON.parse(decrypted)
}

// 桌单条目状态（旧数据无 state 默认 pending）
function stateOf(i) { return i && i.state ? i.state : 'pending' }
function deriveStatus(items) {
  const arr = items || []
  if (arr.some(i => stateOf(i) === 'paying')) return 'paying'
  if (arr.some(i => stateOf(i) === 'pending')) return 'open'
  if (arr.length > 0) return 'paid'
  return 'open'
}
function sumPending(items) {
  return parseFloat((items || []).filter(i => stateOf(i) === 'pending')
    .reduce((s, i) => s + (Number(i.price) || 0) * (i.qty || 1), 0).toFixed(2))
}

// 取餐号：服务端按天顺序生成唯一码（堂食 T01/T02… / 外带 K01/K02…），支付成功时才分配
async function allocatePickupNumber(db, orderType) {
  const type = orderType === 'takeaway' ? 'takeaway' : 'dine-in'
  const prefix = type === 'dine-in' ? 'T' : 'K'
  const day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10) // 北京时间按天
  const key = `${day}_${type}`
  try {
    let seq = 0
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
      await ref.set({ data: { seq: n, orderType: type } })
      seq = n
    })
    return prefix + String(seq).padStart(2, '0')
  } catch (e) {
    console.warn('[createPaymentCallback] 取餐号顺序计数失败，使用随机码兜底:', e.message)
    const letters = 'ABCDEFGH'
    return prefix + letters[Math.floor(Math.random() * letters.length)] +
      String(Math.floor(Math.random() * 99) + 1).padStart(2, '0')
  }
}

exports.main = async (event, context) => {
  const apiKeyV3 = process.env.WX_MCH_API_KEY

  console.log('[createPaymentCallback] 收到回调:', JSON.stringify(event))

  try {
    // HTTP 触发器时 body 在 event.body 中
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || event)

    if (body.event_type !== 'TRANSACTION.SUCCESS') {
      console.log('[createPaymentCallback] 非支付成功通知:', body.event_type)
      return { code: 'SUCCESS', message: '成功' }
    }

    // 解密资源
    const payInfo = decryptResource(apiKeyV3, body.resource)
    console.log('[createPaymentCallback] 支付信息:', JSON.stringify(payInfo))

    const { out_trade_no, trade_state, transaction_id } = payInfo

    if (trade_state === 'SUCCESS') {
      const db = cloud.database()
      const updateData = {
        status: 'making',
        transactionId: transaction_id,
        paidAt: db.serverDate(),
      }

      // 查所有关联订单（堂食+外带各一条；不限定 status，客户端可能已先行置 making）
      let paidOrders = []
      try {
        paidOrders = (await db.collection('orders').where({ outTradeNo: out_trade_no }).get()).data || []
      } catch (e) {
        paidOrders = []
      }
      // 兜底：旧数据 outTradeNo 未写入，按 orderId 匹配
      if (paidOrders.length === 0) {
        try {
          paidOrders = (await db.collection('orders').where({ orderId: out_trade_no }).get()).data || []
        } catch (e) {
          paidOrders = []
        }
      }

      // 幂等补写：仅对「尚无 transactionId」的订单补写，避免重复回调重复通知。
      // 客户端支付成功后已把 status 置 making，故不能再用 status:'pending' 过滤。
      let isFirstUpdate = false
      for (const o of paidOrders) {
        if (!o.transactionId) {
          try {
            // 取餐号支付成功才分配；已有（旧数据下单时已分配 / 客户端 completeTableCheckout 已并发分配）则复用，避免双分配
            let pn = o.pickupNumber || ''
            if (!pn) {
              try {
                const cur = (await db.collection('orders').doc(o._id).get()).data
                if (cur && cur.pickupNumber) pn = cur.pickupNumber
              } catch (e) { /* 忽略，按空处理 */ }
            }
            if (!pn) {
              pn = await allocatePickupNumber(db, o.orderType || 'dine-in')
              // 原子占位：仅当取餐号仍为空时写入；已被 completeTableCheckout 抢先则复用其号码
              let claimed = false
              try {
                const claim = await db.collection('orders')
                  .where({ _id: o._id, pickupNumber: '' })
                  .update({ data: { pickupNumber: pn } })
                claimed = claim.stats && claim.stats.updated > 0
              } catch (e) { /* 忽略 */ }
              if (!claimed) {
                try {
                  const cur = (await db.collection('orders').doc(o._id).get()).data
                  if (cur && cur.pickupNumber) pn = cur.pickupNumber
                } catch (e) { /* 保留已分配的 pn */ }
              }
            }
            o.pickupNumber = pn  // 原地改写，供下方桌单联动读到新码
            await db.collection('orders').doc(o._id).update({ data: { ...updateData, pickupNumber: pn } })
            isFirstUpdate = true
          } catch (e) {
            console.warn('[createPaymentCallback] 补写订单失败:', o._id, e.message)
          }
        }
      }
      console.log('[createPaymentCallback] 订单补写完成, out_trade_no:', out_trade_no, 'isFirstUpdate:', isFirstUpdate)

      let linkageFailed = false

      // ===== 联动共享桌单：按本次支付的条目标记已下单（兼容旧整桌一起付）=====
      try {
        const tableIds = [...new Set(paidOrders.map(o => o.tableId).filter(Boolean))]
        for (const tid of tableIds) {
          const ordersOfTable = paidOrders.filter(o => o.tableId === tid)
          await db.runTransaction(async t => {
            const sref = t.collection('table_sessions').doc(tid)
            let s = null
            try { s = (await sref.get()).data } catch (e) { s = null }
            if (!s) return
            const now = Date.now()
            const items = (s.items || []).slice()
            const completedOrders = (s.completedOrders || []).slice()

            for (const order of ordersOfTable) {
              // 幂等：该订单已记录则跳过
              if (completedOrders.some(c => c.orderId === order._id)) continue
              const uids = order.tableItemUids || []
              if (uids.length > 0) {
                // 新路径（一起付/分开付）：按 uid 标记对应条目
                let matched = []
                for (const uid of uids) {
                  const it = items.find(i => i.uid === uid)
                  if (it && stateOf(it) !== 'paid') matched.push(it)
                }
                // 兜底：按 uid 未命中时回退按 openid 匹配在途结算条目
                if (matched.length === 0) {
                  matched = items.filter(i => stateOf(i) === 'paying' && i.lockOpenid === order.openid)
                }
                if (matched.length === 0) continue
                const amount = matched.reduce((sum, i) => sum + (Number(i.price) || 0) * (i.qty || 1), 0)
                const itemCount = matched.reduce((n, i) => n + (i.qty || 1), 0)
                for (const it of matched) {
                  it.state = 'paid'
                  it.paidOrderId = order._id
                  it.paidPickupNumber = order.pickupNumber || ''
                  it.paidAt = now
                  it.lockOpenid = ''
                  it.lockAt = 0
                  it.lockOrderId = ''
                }
                completedOrders.push({
                  orderId: order._id,
                  pickupNumber: order.pickupNumber || '',
                  paidBy: order.openid,
                  amount: parseFloat((Number(order.totalAmount) || amount).toFixed(2)),
                  itemCount,
                  createdAt: now,
                })
              } else if (s.status === 'paying') {
                // 旧整桌一起付兜底：整桌 items 置 paid
                for (const it of items) {
                  if (stateOf(it) !== 'paid') {
                    it.state = 'paid'
                    it.paidOrderId = order._id
                    it.paidPickupNumber = order.pickupNumber || s.pickupNumber || ''
                    it.paidAt = now
                  }
                }
                completedOrders.push({
                  orderId: order._id,
                  pickupNumber: order.pickupNumber || s.pickupNumber || '',
                  paidBy: order.openid,
                  amount: Number(order.totalAmount) || 0,
                  itemCount: items.reduce((n, i) => n + (i.qty || 1), 0),
                  createdAt: now,
                })
              }
            }

            await sref.update({
              data: {
                items, completedOrders,
                status: deriveStatus(items),
                totalAmount: sumPending(items),
                orderId: out_trade_no,
                updatedAt: now,
              }
            })
          })
          console.log('[createPaymentCallback] 桌单条目已标记, tableId:', tid)
        }
      } catch (e) {
        linkageFailed = true
        console.error('[createPaymentCallback] 联动桌单失败（将返回 FAIL 让微信重试）:', e.message)
      }

      // 幂等保护：仅首次补写 transactionId 时才发通知，防止微信支付重复回调
      if (isFirstUpdate) {

      // ===== 通知店员端有新订单：写事件标记（店员端 watch order_events/latest 触发即时刷新）=====
      try {
        await db.collection('order_events').doc('latest').set({
          data: { ts: Date.now(), orderId: out_trade_no }
        })
        console.log('[createPaymentCallback] 已写入 order_events 事件:', out_trade_no)
      } catch (e) {
        console.warn('[createPaymentCallback] 写入 order_events 失败（不影响支付）:', e.message)
      }

      // ===== 店员离线检测：有设备在看店员端则不发通知 =====
      // 从 admin_whitelist 动态读取所有启用的管理员作为通知对象
      let NOTIFY_RECIPIENTS = []
      try {
        const adminRes = await db.collection('admin_whitelist')
          .where({ status: 1 })
          .get()
        NOTIFY_RECIPIENTS = (adminRes.data || [])
          .map(a => a.openid)
          .filter(id => id && id.startsWith('o') && id.length >= 28) // 过滤非法openid
        console.log('[createPaymentCallback] admin_whitelist 通知对象:', NOTIFY_RECIPIENTS)
      } catch (e) {
        console.warn('[createPaymentCallback] 读取 admin_whitelist 失败，使用空列表', e.message)
      }
      // 收集下单用户的 openid，排除其自身心跳
      const ordererOpenids = [...new Set(paidOrders.map(o => o.openid).filter(Boolean))]
      console.log('[createPaymentCallback] 下单用户 openids:', ordererOpenids)

      let staffOnline = false
      try {
        const hbRes = await db.collection('staff_heartbeat')
          .where({
            lastSeen: db.command.gte(new Date(Date.now() - 120000)),
            openid: ordererOpenids.length > 0 ? db.command.nin(ordererOpenids) : db.command.neq('__no_match__')
          })
          .count()
        staffOnline = hbRes.total > 0
        console.log('[createPaymentCallback] 店员端在线（排除下单用户后）:', staffOnline)
      } catch (e) {
        console.warn('[createPaymentCallback] 心跳查询失败，默认发送通知', e.message)
      }

      // 店员离线时才发送新订单通知
      if (!staffOnline) {
        try {
          if (paidOrders.length > 0) {
            // 逐一向每位店主发送通知
            for (const recipient of NOTIFY_RECIPIENTS) {
              console.log('[createPaymentCallback] 店员离线，发送新订单通知:', recipient)
              try {
                const notifyRes = await cloud.callFunction({
                  name: 'sendSubscribeMessage',
                  data: {
                    scene: 'staff_offline_order',
                    openid: recipient,
                    orders: paidOrders,
                  },
                })
              console.log('[createPaymentCallback] 发送结果:', recipient, JSON.stringify(notifyRes.result))
            } catch (singleErr) {
              // 单个发送失败不影响其他接收者
              console.error('[createPaymentCallback] 发送失败:', recipient, singleErr.message)
            }
          }
        }
      } catch (notifyErr) {
        // 通知失败不影响主流程
        console.error('[createPaymentCallback] 发送订阅消息失败（不影响支付）:', notifyErr.message)
      }
      }
      } else {
        console.log('[createPaymentCallback] 重复回调，跳过通知')
      }

      // 联动桌单失败必须返回 FAIL 让微信重试，否则条目永久卡 paying
      if (linkageFailed) {
        return { code: 'FAIL', message: '联动桌单失败' }
      }
    }

    return { code: 'SUCCESS', message: '成功' }
  } catch (e) {
    console.error('[createPaymentCallback] 处理失败:', e.message)
    return { code: 'FAIL', message: e.message }
  }
}
