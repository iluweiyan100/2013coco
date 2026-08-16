// 云函数入口文件 - 微信支付直连商户 v3 接口
const cloud = require('wx-server-sdk')
const axios = require('axios')
const crypto = require('crypto')
cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

const APP_ID = 'wxb5fb01ff608eaa3e'
const MCH_ID = '1745080857'
const JSAPI_URL = 'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi'
const NOTIFY_URL = 'https://cloud3-d2gbcvyqkbc0fbf94-1419079738.ap-shanghai.app.tcloudbase.com/createPaymentCallback'

// 从环境变量读取商户证书和密钥（在云开发控制台配置）
const PRIVATE_KEY = process.env.WX_MCH_PRIVATE_KEY
const SERIAL_NO = process.env.WX_MCH_SERIAL_NO

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
  // 查单模式：主动查询微信支付订单状态（支付结果兜底，防止「已扣款但本地报错」导致重复支付）
  if (event.action === 'query') {
    const outTradeNo = event.outTradeNo || event.orderId || ''
    if (!outTradeNo) throw new Error('缺少 outTradeNo')
    const urlPath = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${MCH_ID}`
    const { authorization } = buildAuthorization('GET', urlPath, '')
    try {
      const response = await axios.get('https://api.mch.weixin.qq.com' + urlPath, {
        headers: { 'Accept': 'application/json', 'Authorization': authorization, 'User-Agent': 'WXMiniProgram/1.0' },
        timeout: 10000,
      })
      const data = response.data || {}
      return {
        tradeState: data.trade_state || '',
        outTradeNo: data.out_trade_no || outTradeNo,
        transactionId: data.transaction_id || '',
      }
    } catch (e) {
      console.error('[createPayment][query] 查单失败:', e.response ? JSON.stringify(e.response.data) : e.message)
      throw new Error('查单失败: ' + (e.response && e.response.data && e.response.data.message ? e.response.data.message : e.message))
    }
  }

  const { totalAmount, orderId, orderIds, openid } = event

  console.log('[createPayment] 收到支付请求:', { totalAmount, orderId, orderIds, openid })

  if (!openid) {
    throw new Error('缺少 openid')
  }

  // 防低配价：校验客户端传入金额与订单文档合计一致（否则可付 1 分钱拿高额订单）
  const db = cloud.database()
  const orderIdList = (Array.isArray(orderIds) && orderIds.length ? orderIds : [orderId]).filter(Boolean)
  if (orderIdList.length === 0) {
    throw new Error('缺少订单 id')
  }
  let orderTotal = 0
  for (const oid of orderIdList) {
    let doc = null
    try {
      doc = (await db.collection('orders').doc(oid).get()).data
    } catch (e) {
      doc = null
    }
    if (!doc) {
      throw new Error('订单不存在，无法支付')
    }
    orderTotal += Number(doc.totalAmount) || 0
  }
  const reqCents = Math.round((Number(totalAmount) || 0) * 100)
  const orderCents = Math.round(orderTotal * 100)
  if (reqCents !== orderCents) {
    console.error('[createPayment] 金额校验失败:', { reqCents, orderCents, orderIdList })
    throw new Error('订单金额不一致，请重新下单')
  }

  const totalFee = reqCents

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
