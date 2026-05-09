// 云函数入口文件 - 微信支付退款
const cloud = require('wx-server-sdk')
const axios = require('axios')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

const APP_ID = 'wxb5fb01ff608eaa3e'
const MCH_ID = '1745080857'
const SERIAL_NO = '26C6490988BBF77646E44A36C6779A023E875C57'
const REFUND_URL = 'https://api.mch.weixin.qq.com/v3/refund/domestic/refunds'

// 读取私钥
const PRIVATE_KEY = fs.readFileSync(path.join(__dirname, 'apiclient_key.pem'), 'utf8')

// 生成随机字符串
function randomStr(len = 32) {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

// 构造签名串并用私钥签名
function buildAuthorization(method, urlPath, body) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = randomStr(32)
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`

  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  const signature = sign.sign(PRIVATE_KEY, 'base64')

  return {
    authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${SERIAL_NO}",signature="${signature}"`,
    timestamp,
    nonce,
  }
}

exports.main = async (event, context) => {
  const { orderId, outTradeNo, transactionId, refundAmount } = event
  const apiKeyV3 = process.env.WX_MCH_API_KEY

  console.log('[refundPayment] 收到退款请求:', { orderId, outTradeNo, transactionId, refundAmount })

  if (!outTradeNo && !transactionId) {
    throw new Error('缺少 outTradeNo 或 transactionId')
  }

  const db = cloud.database()

  // 查询所有关联订单（可能包含堂食和外带）
  let relatedOrders = []
  if (outTradeNo) {
    const orderRes = await db.collection('orders').where({ outTradeNo }).get()
    relatedOrders = orderRes.data || []
  } else if (transactionId) {
    const orderRes = await db.collection('orders').where({ transactionId }).get()
    relatedOrders = orderRes.data || []
  }

  if (!relatedOrders || relatedOrders.length === 0) {
    throw new Error('订单不存在')
  }

  console.log('[refundPayment] 查询到关联订单数量:', relatedOrders.length)

  // 检查是否所有关联订单都已退款
  const allRefunded = relatedOrders.every(order => order.status === 'refunded')
  if (allRefunded) {
    console.log('[refundPayment] 所有关联订单已退款')
    return {
      success: true,
      alreadyRefunded: true,
      message: '订单已退款',
      refundId: relatedOrders[0].refundId,
      refundNo: relatedOrders[0].refundNo,
      refundTime: relatedOrders[0].refundTime
    }
  }

  // 找到当前要退款的订单
  const currentOrder = relatedOrders.find(o => o._id === orderId) || relatedOrders[0]
  if (!currentOrder) {
    throw new Error('当前订单不存在')
  }

  // 检查当前订单是否已退款
  if (currentOrder.status === 'refunded') {
    return {
      success: true,
      alreadyRefunded: true,
      message: '订单已退款',
      refundId: currentOrder.refundId,
      refundNo: currentOrder.refundNo,
      refundTime: currentOrder.refundTime
    }
  }

  // 计算所有关联订单的总金额（微信支付原始订单金额）
  let totalAmount = 0
  let totalRefundedAmount = 0
  relatedOrders.forEach(order => {
    totalAmount += order.totalAmount || 0
    if (order.status === 'refunded') {
      // 如果有 refundAmount 字段，直接使用
      // 如果没有 refundAmount 字段，使用 totalAmount 作为已退款金额
      totalRefundedAmount += order.refundAmount || order.totalAmount || 0
    }
  })

  console.log('[refundPayment] 订单统计:', { totalAmount, totalRefundedAmount, currentRefund: refundAmount })

  // 检查是否已全额退款
  if (Math.abs(totalRefundedAmount - totalAmount) < 0.01) {
    console.log('[refundPayment] 已全额退款，无需重复操作')
    return {
      success: true,
      alreadyRefunded: true,
      message: '订单已全额退款',
      refundId: relatedOrders[0].refundId,
      refundNo: relatedOrders[0].refundNo,
      refundTime: relatedOrders[0].refundTime
    }
  }

  // 退款金额（单位：分）
  const totalFee = Math.round(totalAmount * 100)
  const refundFee = Math.round(refundAmount * 100)

  // 生成退款单号
  const outRefundNo = `RF${Date.now()}${randomStr(8)}`

  const reqBody = JSON.stringify({
    out_trade_no: outTradeNo,
    transaction_id: transactionId,
    out_refund_no: outRefundNo,
    reason: '商家退款',
    amount: {
      refund: refundFee,
      total: totalFee,
      currency: 'CNY',
    },
    notify_url: `${process.env.REFUND_NOTIFY_URL || 'https://cloud3-d2gbcvyqkbc0fbf94-1419079738.ap-shanghai.app.tcloudbase.com'}/refundCallback`
  })

  const urlPath = '/v3/refund/domestic/refunds'
  const { authorization, timestamp, nonce } = buildAuthorization('POST', urlPath, reqBody)

  console.log('[refundPayment] 发起部分退款申请:', { refundFee, totalFee, outRefundNo })

  try {
    const response = await axios.post(REFUND_URL, reqBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization,
        'User-Agent': 'WXMiniProgram/1.0',
      },
      timeout: 10000,
    })

    const { status, refund_id } = response.data
    console.log('[refundPayment] 退款申请成功:', { status, refund_id, outRefundNo })

    // 计算退款后的累计金额
    const newTotalRefunded = totalRefundedAmount + (refundFee / 100)
    const isFullRefund = Math.abs(newTotalRefunded - totalAmount) < 0.01

    console.log('[refundPayment] 退款统计:', {
      totalRefundedAmount,
      currentRefund: refundFee / 100,
      newTotalRefunded,
      totalAmount,
      isFullRefund
    })

    // 更新当前订单的退款信息
    const updateData = {
      refundId: refund_id,
      refundNo: outRefundNo,
      refundTime: db.serverDate(),
      refundAmount: refundFee / 100
    }

    // 只更新当前订单的退款信息
    await db.collection('orders')
      .doc(currentOrder._id)
      .update({ data: updateData })

    // 只有全额退款时才更新订单状态
    if (isFullRefund) {
      // 已全额退款，更新所有关联订单状态
      console.log('[refundPayment] 已全额退款，更新所有关联订单状态')
      await db.collection('orders')
        .where({ outTradeNo: outTradeNo })
        .update({ data: { status: 'refunded' } })
    } else {
      // 部分退款，只更新当前订单状态
      console.log('[refundPayment] 部分退款，更新当前订单状态')
      await db.collection('orders')
        .doc(currentOrder._id)
        .update({ data: { status: 'refunded' } })
    }

    return {
      success: true,
      refundId: refund_id,
      outRefundNo: outRefundNo,
      message: '退款申请成功',
      isPartialRefund: Math.abs(newTotalRefunded - totalAmount) >= 0.01,
      totalRefunded: newTotalRefunded,
      totalAmount: totalAmount
    }
  } catch (e) {
    // 如果是"订单金额或退款金额与之前请求不一致"错误，说明已经部分退款过
    const errorMsg = e.response?.data?.message || e.message || ''
    if (errorMsg.includes('金额或退款金额与之前请求不一致') ||
        errorMsg.includes('退款金额不一致') ||
        errorMsg.includes('订单已退款')) {
      console.log('[refundPayment] 检测到可能已部分退款，查询订单状态')

      // 重新查询订单状态
      let updatedOrders = []
      if (outTradeNo) {
        const orderRes = await db.collection('orders').where({ outTradeNo }).get()
        updatedOrders = orderRes.data || []
      } else if (transactionId) {
        const orderRes = await db.collection('orders').where({ transactionId }).get()
        updatedOrders = orderRes.data || []
      }

      // 计算已退款金额
      let totalRefunded = 0
      updatedOrders.forEach(order => {
        if (order.status === 'refunded' && order.refundAmount) {
          totalRefunded += order.refundAmount
        }
      })

      // 如果当前订单已退款
      const updatedCurrentOrder = updatedOrders.find(o => o._id === currentOrder._id)
      if (updatedCurrentOrder && updatedCurrentOrder.status === 'refunded') {
        console.log('[refundPayment] 当前订单已退款，无需重复操作')
        return {
          success: true,
          alreadyRefunded: true,
          message: '订单已退款',
          refundId: updatedCurrentOrder.refundId,
          refundNo: updatedCurrentOrder.refundNo,
          refundTime: updatedCurrentOrder.refundTime
        }
      }

      // 检查是否已全额退款
      if (Math.abs(totalRefunded - totalAmount) < 0.01) {
        console.log('[refundPayment] 订单已全额退款')
        return {
          success: true,
          alreadyRefunded: true,
          message: '订单已全额退款',
          refundId: updatedOrders[0].refundId,
          refundNo: updatedOrders[0].refundNo,
          refundTime: updatedOrders[0].refundTime
        }
      }
    }

    if (e.response) {
      console.error('[refundPayment] 微信支付退款错误:', JSON.stringify(e.response.data))
      throw new Error('退款失败: ' + (e.response.data.message || JSON.stringify(e.response.data)))
    }
    console.error('[refundPayment] 请求失败:', e.message)
    throw e
  }
}
