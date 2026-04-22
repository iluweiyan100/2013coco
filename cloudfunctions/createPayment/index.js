// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { totalAmount, orderId, openid } = event

  console.log('[createPayment] 收到支付请求:', { totalAmount, orderId, openid })

  try {
    // 1. 调用微信统一下单API
    const res = await cloud.cloudPay.unifiedOrder({
      body: '2013coco 订单支付',
      outTradeNo: orderId,
      spbillCreateIp: '127.0.0.1',
      totalFee: Math.round(totalAmount * 100), // 元转分
      functionName: 'createPaymentCallback', // 支付结果回调函数
      subMchId: '1638338741', // 商户号
      envId: 'cloud1-8grqm06168739c22' // 直接指定环境ID
    })

    console.log('[createPayment] 微信支付返回:', res)

    // 检查返回结果
    if (!res || !res.timeStamp || !res.nonceStr || !res.package || !res.signType || !res.paySign) {
      console.error('[createPayment] 微信支付参数不完整:', res)
      throw new Error('微信支付参数不完整: ' + (res.returnMsg || '未知错误'))
    }

    return {
      paymentParams: {
        timeStamp: res.timeStamp,
        nonceStr: res.nonceStr,
        package: res.package,
        signType: res.signType,
        paySign: res.paySign
      },
      orderId
    }
  } catch (e) {
    console.error('[createPayment] 错误:', e)
    throw e
  }
}
