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
        .where({ outTradeNo: out_trade_no })
        .update({ data: updateData })
      console.log('[createPaymentCallback] 按 outTradeNo 更新条数:', byOutTradeNo.stats.updated)

      // 兜底：若 outTradeNo 未写入（单订单旧数据），按 orderId 精确更新
      if (byOutTradeNo.stats.updated === 0) {
        const byOrderId = await db.collection('orders')
          .where({ orderId: out_trade_no })
          .update({ data: updateData })
        console.log('[createPaymentCallback] 按 orderId 兜底更新条数:', byOrderId.stats.updated)
      }

      console.log('[createPaymentCallback] 订单更新完成, out_trade_no:', out_trade_no)
    }

    return { code: 'SUCCESS', message: '成功' }
  } catch (e) {
    console.error('[createPaymentCallback] 处理失败:', e.message)
    return { code: 'FAIL', message: e.message }
  }
}
