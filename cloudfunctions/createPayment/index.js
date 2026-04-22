// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

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
      subMchId: '1638338741',
      envId: 'cloud3-d2gbcvyqkbc0fbf94'
    })

    console.log('[createPayment] 微信支付完整返回:', JSON.stringify(res))

    // cloudPay.unifiedOrder 成功时 returnCode === 'SUCCESS'
    if (!res || res.returnCode !== 'SUCCESS' || res.resultCode !== 'SUCCESS') {
      console.error('[createPayment] 支付下单失败:', res)
      throw new Error('支付下单失败: ' + (res && (res.errCodeDes || res.returnMsg) || '未知错误'))
    }

    // 返回微信支付所需的全部参数（字段名以实际返回为准）
    return {
      paymentParams: {
        timeStamp: res.timeStamp,
        nonceStr: res.nonceStr,
        package: res.package,
        signType: res.signType || 'MD5',
        paySign: res.paySign
      },
      orderId
    }
  } catch (e) {
    console.error('[createPayment] 错误:', e)
    throw e
  }
}
