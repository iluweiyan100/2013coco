// 云函数 - 定时关闭超时待支付订单（30 分钟未支付 → 关闭微信单并删除订单）
// 复用 createPayment 的微信支付 v3 签名模式；权威判据为「关闭订单」接口返回结果
const cloud = require('wx-server-sdk')
const axios = require('axios')
const crypto = require('crypto')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

const db = cloud.database()

const APP_ID = 'wxb5fb01ff608eaa3e'
const MCH_ID = '1745080857'

// 从环境变量读取商户证书和密钥（在云开发控制台配置，与 createPayment 相同）
const PRIVATE_KEY = process.env.WX_MCH_PRIVATE_KEY
const SERIAL_NO = process.env.WX_MCH_SERIAL_NO

// 超时阈值：30 分钟
const CUTOFF = 30 * 60 * 1000
// 单次处理上限，超时未处理的留待下一轮（幂等、自愈）
const LIMIT = 100

function randomStr(len = 32) {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

// 构造签名串并用私钥签名（与 createPayment/index.js 一致）
function buildAuthorization(method, urlPath, body) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = randomStr(32)
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`

  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  const signature = sign.sign(PRIVATE_KEY, 'base64')

  return {
    authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${SERIAL_NO}",signature="${signature}"`,
  }
}

// 关闭一张微信订单，返回处置结论：'DELETE' 可删除 / 'SKIP' 跳过（下一轮重试）
async function closeOrder(outTradeNo) {
  // 无微信单号 → 从未真正下单，必未支付，可安全删除
  if (!outTradeNo) return 'DELETE'

  const urlPath = `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`
  const body = JSON.stringify({ mchid: MCH_ID })
  const { authorization } = buildAuthorization('POST', urlPath, body)

  try {
    const response = await axios.post('https://api.mch.weixin.qq.com' + urlPath, body, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization,
        'User-Agent': 'WXMiniProgram/1.0',
      },
      timeout: 10000,
      validateStatus: () => true, // 让 4xx/5xx 也进入业务判断
    })

    const status = response.status
    // 204 关闭成功 / 200 兼容
    if (status === 204 || status === 200) return 'DELETE'

    const code = (response.data && response.data.code) || ''
    if (code === 'ORDER_CLOSED' || code === 'ORDER_NOT_EXIST') return 'DELETE' // 已关闭/不存在 → 删除
    if (code === 'ORDER_PAID') return 'SKIP' // 已支付 → 绝不删，webhook 兜底

    console.warn('[closeExpiredOrders] 关闭未决:', outTradeNo, status, code)
    return 'SKIP' // 其它错误，留待下一轮
  } catch (e) {
    console.warn('[closeExpiredOrders] 关闭请求异常:', outTradeNo, e.message)
    return 'SKIP' // 网络异常，下一轮重试
  }
}

exports.main = async () => {
  // 未配置商户证书环境变量时跳过，避免占位符导致签名崩溃（配置见控制台，与 createPayment 相同）
  if (!PRIVATE_KEY || !SERIAL_NO || PRIVATE_KEY.indexOf('__SET_IN_CLOUD_CONSOLE__') !== -1) {
    console.warn('[closeExpiredOrders] 未配置商户证书环境变量（WX_MCH_PRIVATE_KEY/WX_MCH_SERIAL_NO），跳过本轮')
    return { success: false, message: '未配置商户证书环境变量' }
  }

  const res = await db.collection('orders')
    .where({
      status: 'pending',
      createTime: db.command.lte(new Date(Date.now() - CUTOFF)),
    })
    .limit(LIMIT)
    .get()

  const orders = res.data || []
  let deleted = 0
  let skipped = 0

  for (const order of orders) {
    const decision = await closeOrder(order.outTradeNo)
    if (decision === 'DELETE') {
      try {
        await db.collection('orders').doc(order._id).remove()
        deleted++
      } catch (e) {
        console.warn('[closeExpiredOrders] 删除失败:', order._id, e.message)
      }
    } else {
      skipped++
    }
  }

  console.log('[closeExpiredOrders] 完成:', { total: orders.length, deleted, skipped })
  return { success: true, total: orders.length, deleted, skipped }
}
