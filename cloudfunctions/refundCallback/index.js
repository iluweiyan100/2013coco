// 云函数 - 微信支付退款结果异步回调（对账 REFUND.SUCCESS / ABNORMAL / CLOSED）
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

// AES-256-GCM 解密回调数据
function decryptResource(apiKeyV3, resource) {
  const { ciphertext, nonce, associated_data } = resource
  const key = Buffer.from(apiKeyV3, 'utf8')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(Buffer.from(ciphertext, 'base64').slice(-16))
  decipher.setAAD(Buffer.from(associated_data || ''))
  const ciphertextBuf = Buffer.from(ciphertext, 'base64').slice(0, -16)
  let decrypted = decipher.update(ciphertextBuf, null, 'utf8')
  decrypted += decipher.final('utf8')
  return JSON.parse(decrypted)
}

// 退款成功：把对应批次标记为 success（同步路径通常已标记，这里幂等兜底）
async function confirmRefundBatch(db, orderId, outRefundNo) {
  await db.runTransaction(async t => {
    const re = await t.collection('orders').doc(orderId).get()
    const cur = re.data || {}
    const batches = cur.refundBatches || []
    if (!batches.some(b => b.outRefundNo === outRefundNo)) return
    const updatedBatches = batches.map(b =>
      b.outRefundNo === outRefundNo ? { ...b, status: 'success' } : b
    )
    await t.collection('orders').doc(orderId).update({ data: { refundBatches: updatedBatches } })
  })
}

// 退款失败（ABNORMAL/CLOSED）：回退该批次的 refunded 标记与状态，避免「钱没退但单已标退」
async function revertRefundBatch(db, orderId, outRefundNo) {
  await db.runTransaction(async t => {
    const re = await t.collection('orders').doc(orderId).get()
    const cur = re.data || {}
    const curProducts = cur.products || []
    const batches = cur.refundBatches || []
    const batch = batches.find(b => b.outRefundNo === outRefundNo)
    if (!batch) return
    const indexes = batch.indexes || []
    const updatedProducts = curProducts.map((p, i) =>
      indexes.includes(i) ? { ...p, refunded: false } : p
    )
    const allRefunded = updatedProducts.every(p => p.refunded)
    const totalRefundedAmount = updatedProducts.reduce((s, p) => s + (p.refunded ? (Number(p.price) || 0) : 0), 0)
    const updatedBatches = batches.map(b =>
      b.outRefundNo === outRefundNo ? { ...b, status: 'failed' } : b
    )
    const updateData = {
      products: updatedProducts,
      refundAmount: Math.round(totalRefundedAmount * 100) / 100,
      refundBatches: updatedBatches
    }
    if (cur.status === 'refunded' && !allRefunded) {
      updateData.status = batch.prevStatus || 'done'
    }
    await t.collection('orders').doc(orderId).update({ data: updateData })
  })
}

exports.main = async (event, context) => {
  const apiKeyV3 = process.env.WX_MCH_API_KEY
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || event)
    if (!body || !body.resource) {
      return { code: 'SUCCESS', message: '成功' }
    }

    const refund = decryptResource(apiKeyV3, body.resource)
    const eventType = body.event_type || ''
    const { out_trade_no, out_refund_no } = refund
    console.log('[refundCallback] 退款回执:', eventType, out_refund_no, refund.refund_status)

    if (!out_trade_no || !out_refund_no) {
      return { code: 'SUCCESS', message: '成功' }
    }

    const db = cloud.database()
    const orders = (await db.collection('orders').where({ outTradeNo: out_trade_no }).get()).data || []

    if (eventType === 'REFUND.SUCCESS') {
      for (const o of orders) {
        await confirmRefundBatch(db, o._id, out_refund_no)
          .catch(e => console.warn('[refundCallback] 确认退款批次失败', e.message))
      }
    } else if (eventType === 'REFUND.ABNORMAL' || eventType === 'REFUND.CLOSED') {
      for (const o of orders) {
        await revertRefundBatch(db, o._id, out_refund_no)
          .catch(e => console.warn('[refundCallback] 回退退款批次失败', e.message))
      }
    }

    return { code: 'SUCCESS', message: '成功' }
  } catch (e) {
    console.error('[refundCallback] 处理失败:', e.message)
    // 返回 FAIL 让微信重试
    return { code: 'FAIL', message: e.message }
  }
}
