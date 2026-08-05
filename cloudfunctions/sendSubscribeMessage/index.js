// 发送订阅消息云函数
// 支持场景：payment_success（付款成功通知）
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

// 模板配置
const TEMPLATES = {
  payment_success: 's7sRsWNh7BbFcgKQFAD9_zm38vcp9r46grgRQsgnzHg', // 付款成功通知（模板11110）
  pickup_notify: 'uNRy5DBtfAe4d_SC1yuTXKwrbvcU1sDxpsW9U8sZPBw',     // 人工窗口取餐通知（模板15942）
}

// access_token 缓存
let cachedToken = null
let tokenExpireTime = 0

const APPID = 'wxb5fb01ff608eaa3e'

/**
 * 获取 access_token（带缓存）
 */
async function getAccessToken() {
  const now = Date.now()
  // 提前 5 分钟过期，避免边界情况
  if (cachedToken && now < tokenExpireTime - 300000) {
    console.log('[sendSubscribeMessage] 使用缓存的 access_token')
    return cachedToken
  }

  const secret = process.env.WX_APP_SECRET
  if (!secret) {
    throw new Error('缺少环境变量 WX_APP_SECRET，请在云函数环境变量中配置')
  }

  // 使用 stable_token API，避免多云函数互相踢掉 token
  const postData = JSON.stringify({ grant_type: 'client_credential', appid: APPID, secret: secret })
  const url = `https://api.weixin.qq.com/cgi-bin/stable_token`

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try {
          const data = JSON.parse(body)
          if (data.access_token) {
            cachedToken = data.access_token
            tokenExpireTime = now + (data.expires_in || 7200) * 1000
            console.log('[sendSubscribeMessage] 获取新 access_token 成功, 有效期:', data.expires_in)
            resolve(cachedToken)
          } else {
            console.error('[sendSubscribeMessage] 获取 access_token 失败:', body)
            reject(new Error('获取 access_token 失败: ' + body))
          }
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', (err) => {
      console.error('[sendSubscribeMessage] 请求 access_token 网络错误:', err.message)
      reject(err)
    })
    req.write(postData)
    req.end()
  })
}

/**
 * 发送订阅消息
 * @param {string} touser - 接收者 openid
 * @param {string} templateId - 模板 ID
 * @param {object} data - 模板字段数据
 */
async function sendMessage(touser, templateId, data) {
  const accessToken = await getAccessToken()
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`

  // miniprogram_state: developer(开发版) / trial(体验版) / formal(正式版)
  // 真机预览测试期间使用 developer，正式上线后改为 formal
  const miniprogramState = process.env.MINIPROGRAM_STATE || 'developer'

  const payload = {
    touser,
    template_id: templateId,
    page: '/pages/orders/orders',
    miniprogram_state: miniprogramState,
    data,
  }

  const postData = JSON.stringify(payload)

  console.log('[sendSubscribeMessage] 发送请求:', {
    touser,
    templateId,
    miniprogramState,
    data: JSON.stringify(data),
  })

  return new Promise((resolve, reject) => {
    const postBody = Buffer.from(postData, 'utf8')
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postBody.length,
      },
    }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        console.log('[sendSubscribeMessage] 响应:', body)
        // 空响应处理
        if (!body || body.trim() === '') {
          console.warn('[sendSubscribeMessage] 微信 API 返回空响应')
          resolve({ success: false, reason: 'empty_response' })
          return
        }
        try {
          const result = JSON.parse(body)
          if (result.errcode === 0) {
            console.log('[sendSubscribeMessage] 发送成功')
            resolve({ success: true, result })
          } else {
            // 43101: 用户拒绝接收消息（未授权），不视为错误
            if (result.errcode === 43101) {
              console.warn('[sendSubscribeMessage] 用户未授权订阅消息:', result.errmsg)
              resolve({ success: false, refused: true, errcode: result.errcode })
            } else {
              console.error('[sendSubscribeMessage] 发送失败:', JSON.stringify(result))
              reject(new Error(`发送失败: ${result.errcode} ${result.errmsg}`))
            }
          }
        } catch (e) {
          console.error('[sendSubscribeMessage] 解析响应失败:', body)
          reject(e)
        }
      })
    })

    req.on('error', (err) => {
      console.error('[sendSubscribeMessage] 网络错误:', err.message)
      reject(err)
    })

    req.write(postBody)
    req.end()
  })
}

/**
 * 格式化付款时间
 */
function formatPayTime(date) {
  // 云函数环境为 UTC，转为北京时间 (UTC+8)
  const bj = new Date(date.getTime() + 8 * 3600000)
  const y = bj.getUTCFullYear()
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0')
  const d = String(bj.getUTCDate()).padStart(2, '0')
  const h = String(bj.getUTCHours()).padStart(2, '0')
  const min = String(bj.getUTCMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

/**
 * 场景：付款成功通知
 * 模板字段: time1(付款时间), amount2(付款金额), thing7(餐品名称)
 */
async function sendPaymentSuccess(orders, openid) {
  if (!orders || orders.length === 0) {
    console.warn('[sendSubscribeMessage] 无订单数据，跳过发送')
    return { success: false, reason: 'no_orders' }
  }

  // 汇总订单信息
  let totalAmount = 0
  const productNames = []
  orders.forEach(order => {
    totalAmount += order.totalAmount || 0
    const products = order.products || []
    products.forEach(p => {
      const name = p.name || ''
      if (name && !productNames.includes(name)) {
        productNames.push(name)
      }
    })
  })

  // 餐品名称：最多 20 字符（thing 类型限制），多个用顿号分隔
  let productNameStr = productNames.join('、')
  if (productNameStr.length > 20) {
    // 逐个截断
    productNameStr = ''
    for (const name of productNames) {
      const candidate = productNameStr ? productNameStr + '、' + name : name
      if (candidate.length > 20) {
        productNameStr = candidate.slice(0, 17) + '...'
        break
      }
      productNameStr = candidate
    }
  }
  // 兜底
  if (!productNameStr) {
    productNameStr = '商品'
  }

  const now = new Date()
  const amountStr = totalAmount.toFixed(2) + '元'

  console.log('[sendSubscribeMessage] 付款成功通知数据:', {
    openid,
    productNameStr,
    amountStr,
    totalAmount,
  })

  try {
    const result = await sendMessage(openid, TEMPLATES.payment_success, {
      time1: {
        value: formatPayTime(now),
      },
      amount2: {
        value: amountStr,
      },
      thing7: {
        value: productNameStr,
      },
    })
    return result
  } catch (e) {
    console.error('[sendSubscribeMessage] 付款成功通知发送失败:', e.message)
    return { success: false, error: e.message }
  }
}

/**
 * 场景：人工窗口取餐通知
 * 模板字段: time4(下单时间), character_string1(取餐码)
 * @param {string} openid - 接收者（顾客）openid
 * @param {string} pickupNumber - 取餐码
 * @param {*} createTime - 下单时间（Date 或云数据库 serverDate）
 */
async function sendPickupNotify(openid, pickupNumber, createTime) {
  if (!pickupNumber) {
    console.warn('[sendSubscribeMessage] 缺少取餐码，跳过发送')
    return { success: false, reason: 'missing_pickup_number' }
  }

  // 格式化下单时间
  let orderTime
  if (createTime && createTime.$date) {
    // 云数据库 serverDate 格式
    orderTime = new Date(createTime.$date)
  } else if (createTime) {
    orderTime = new Date(createTime)
  } else {
    orderTime = new Date()
  }

  // character_string 类型：最大 32 字符，不可为空
  const pickupStr = String(pickupNumber).slice(0, 32)

  console.log('[sendSubscribeMessage] 取餐通知数据:', {
    openid,
    pickupNumber: pickupStr,
    orderTime: formatPayTime(orderTime),
  })

  try {
    const result = await sendMessage(openid, TEMPLATES.pickup_notify, {
      time4: {
        value: formatPayTime(orderTime),
      },
      character_string1: {
        value: pickupStr,
      },
    })
    return result
  } catch (e) {
    console.error('[sendSubscribeMessage] 取餐通知发送失败:', e.message)
    return { success: false, error: e.message }
  }
}

/**
 * 云函数入口
 * @param {object} event
 * @param {string} event.scene - 场景标识: 'payment_success' | 'pickup_notify'
 * @param {array}  event.orders - 订单数据数组（payment_success 场景）
 * @param {string} event.openid - 接收者 openid
 * @param {string} event.pickupNumber - 取餐码（pickup_notify 场景）
 * @param {*}      event.createTime - 下单时间（pickup_notify 场景）
 */
exports.main = async (event, context) => {
  const { scene, orders, openid, pickupNumber, createTime } = event

  console.log('[sendSubscribeMessage] 入口:', { scene, openid, orderCount: orders ? orders.length : 0, pickupNumber })

  if (!openid) {
    console.warn('[sendSubscribeMessage] 缺少 openid')
    return { success: false, reason: 'missing_openid' }
  }

  switch (scene) {
    case 'payment_success':
    case 'staff_offline_order':  // 店员离线时的新订单通知，复用同一模板
      return await sendPaymentSuccess(orders, openid)

    case 'pickup_notify':
      return await sendPickupNotify(openid, pickupNumber, createTime)

    default:
      console.warn('[sendSubscribeMessage] 未知场景:', scene)
      return { success: false, reason: 'unknown_scene' }
  }
}
