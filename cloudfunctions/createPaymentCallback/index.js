// 云函数入口文件 - 支付结果回调
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  console.log('[createPaymentCallback] 支付回调:', event)
  
  const { outTradeNo, transactionId, returnCode, resultCode } = event
  
  if (returnCode === 'SUCCESS' && resultCode === 'SUCCESS') {
    // 支付成功，更新订单状态
    try {
      await db.collection('orders').doc(outTradeNo).update({
        data: {
          status: 'making',
          payTime: db.serverDate(),
          transactionId: transactionId
        }
      })
      console.log('[createPaymentCallback] 订单状态已更新')
      return { errcode: 0, errmsg: 'SUCCESS' }
    } catch (e) {
      console.error('[createPaymentCallback] 更新订单失败:', e)
      throw e
    }
  }
  
  return { errcode: 0, errmsg: 'SUCCESS' }
}
