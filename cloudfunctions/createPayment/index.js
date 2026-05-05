// 云函数入口文件 - 微信支付直连商户 v3 接口
const cloud = require('wx-server-sdk')
const axios = require('axios')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

const APP_ID = 'wxb5fb01ff608eaa3e'
const MCH_ID = '1745080857'
const SERIAL_NO = '26C6490988BBF77646E44A36C6779A023E875C57'
const JSAPI_URL = 'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi'
const NOTIFY_URL = 'https://cloud3-d2gbcvyqkbc0fbf94-1419079738.ap-shanghai.app.tcloudbase.com/createPaymentCallback'

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
  const { totalAmount, orderId, orderIds, openid } = event
  const apiKeyV3 = process.env.WX_MCH_API_KEY

  console.log('[createPayment] 收到支付请求:', { totalAmount, orderId, orderIds, openid })

  if (!openid) {
    throw new Error('缺少 openid')
  }

  const totalFee = Math.round(totalAmount * 100)

  const reqBody = JSON.stringify({
    appid: APP_ID,
    mchid: MCH_ID,
    description: '2013coco 订单支付',
    out_trade_no: orderId,
    notify_url: NOTIFY_URL,
    amount: {
      total: totalFee,
      currency: 'CNY',
    },
    payer: {
      openid: openid,
    },
  })

  const urlPath = '/v3/pay/transactions/jsapi'
  const { authorization, timestamp, nonce } = buildAuthorization('POST', urlPath, reqBody)

  console.log('[createPayment] 发起统一下单...')

  try {
    const response = await axios.post(JSAPI_URL, reqBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization,
        'User-Agent': 'WXMiniProgram/1.0',
      },
      timeout: 10000,
    })

    const { prepay_id } = response.data
    console.log('[createPayment] 下单成功, prepay_id:', prepay_id)

    // 构造前端调起支付所需参数（v3 前端签名仍用 RSA）
    const packageStr = `prepay_id=${prepay_id}`
    const message = `${APP_ID}\n${timestamp}\n${nonce}\n${packageStr}\n`

    const sign = crypto.createSign('RSA-SHA256')
    sign.update(message)
    const paySign = sign.sign(PRIVATE_KEY, 'base64')

    return {
      paymentParams: {
        timeStamp: timestamp,
        nonceStr: nonce,
        package: packageStr,
        signType: 'RSA',
        paySign,
      },
      orderId,
      orderIds: orderIds || [orderId],
    }
  } catch (e) {
    if (e.response) {
      console.error('[createPayment] 微信支付错误:', JSON.stringify(e.response.data))
      throw new Error('统一下单失败: ' + (e.response.data.message || JSON.stringify(e.response.data)))
    }
    console.error('[createPayment] 请求失败:', e.message)
    throw e
  }
}
