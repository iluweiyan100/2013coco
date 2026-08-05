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

      // 通过 outTradeNo 字段批量更新所有关联订单（堂食+外带各一条）
      const byOutTradeNo = await db.collection('orders')
        .where({ outTradeNo: out_trade_no, status: 'pending' })
        .update({ data: updateData })
      console.log('[createPaymentCallback] 按 outTradeNo 更新条数:', byOutTradeNo.stats.updated)

      // 兜底：若 outTradeNo 未写入（单订单旧数据），按 orderId 精确更新
      let byOrderIdUpdated = 0
      if (byOutTradeNo.stats.updated === 0) {
        const byOrderId = await db.collection('orders')
          .where({ orderId: out_trade_no, status: 'pending' })
          .update({ data: updateData })
        console.log('[createPaymentCallback] 按 orderId 兜底更新条数:', byOrderId.stats.updated)
        byOrderIdUpdated = byOrderId.stats.updated
      }

      console.log('[createPaymentCallback] 订单更新完成, out_trade_no:', out_trade_no)

      // 幂等保护：仅首次更新成功时才发通知，防止微信支付重复回调
      const isFirstUpdate = byOutTradeNo.stats.updated > 0 || byOrderIdUpdated > 0
      if (!isFirstUpdate) {
        console.log('[createPaymentCallback] 订单已处理过，跳过通知')
        return { code: 'SUCCESS', message: '成功' }
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
      // 查询订单（提前获取下单用户 openid，用于排除自身心跳）
      const orderQuery = await db.collection('orders')
        .where({ outTradeNo: out_trade_no })
        .get()
      const paidOrders = orderQuery.data.length > 0 ? orderQuery.data : (
        await db.collection('orders').where({ orderId: out_trade_no }).get()
      ).data

      // 收集下单用户的 openid，排除其自身心跳
      const ordererOpenids = [...new Set(paidOrders.map(o => o.openid).filter(Boolean))]
      console.log('[createPaymentCallback] 下单用户 openids:', ordererOpenids)

      let staffOnline = false
      try {
        const hbRes = await db.collection('staff_heartbeat')
          .where({
            lastSeen: db.command.gte(new Date(Date.now() - 60000)),
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

    }

    return { code: 'SUCCESS', message: '成功' }
  } catch (e) {
    console.error('[createPaymentCallback] 处理失败:', e.message)
    return { code: 'FAIL', message: e.message }
  }
}
