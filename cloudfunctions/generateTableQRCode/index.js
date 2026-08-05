// 生成桌面点单小程序码云函数
// 调用微信 getwxacodeunlimit API 生成小程序码，上传云存储，关联桌位记录
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

const APPID = 'wxb5fb01ff608eaa3e'

// access_token 缓存（与 sendSubscribeMessage 相同模式）
let cachedToken = null
let tokenExpireTime = 0

/**
 * 获取 access_token（带缓存）
 */
async function getAccessToken() {
  const now = Date.now()
  // 提前 5 分钟过期，避免边界情况
  if (cachedToken && now < tokenExpireTime - 300000) {
    console.log('[generateTableQRCode] 使用缓存的 access_token')
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
            console.log('[generateTableQRCode] 获取新 access_token 成功, 有效期:', data.expires_in)
            resolve(cachedToken)
          } else {
            console.error('[generateTableQRCode] 获取 access_token 失败:', body)
            reject(new Error('获取 access_token 失败: ' + body))
          }
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', (err) => {
      console.error('[generateTableQRCode] 请求 access_token 网络错误:', err.message)
      reject(err)
    })
    req.write(postData)
    req.end()
  })
}

/**
 * 调用 getwxacodeunlimit 获取小程序码图片 buffer
 */
function getWxacodeUnlimit(accessToken, scene, page, envVersion) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      scene: scene,
      page: page,
      width: 430,
      auto_color: true,
      env_version: envVersion || 'release'
    })

    const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        // 检查是否为 JSON 错误响应（首字节为 {）
        if (buffer.length > 0 && buffer[0] === 0x7b) {
          try {
            const errData = JSON.parse(buffer.toString('utf8'))
            console.error('[generateTableQRCode] getwxacodeunlimit 返回错误:', errData)
            reject(new Error(`生成小程序码失败: ${errData.errmsg || '未知错误'} (errcode: ${errData.errcode})`))
            return
          } catch (parseErr) {
            // 不是 JSON，当作图片处理
          }
        }
        if (buffer.length === 0) {
          reject(new Error('生成小程序码失败: 返回空内容'))
          return
        }
        resolve(buffer)
      })
    })

    req.on('error', (err) => {
      console.error('[generateTableQRCode] getwxacodeunlimit 网络错误:', err.message)
      reject(err)
    })

    req.write(postData)
    req.end()
  })
}

exports.main = async (event, context) => {
  const { tableId } = event

  if (!tableId) {
    return { success: false, message: '缺少参数 tableId' }
  }

  const db = cloud.database()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  console.log('[generateTableQRCode] 收到请求, tableId:', tableId, ', openid:', openid)

  try {
    // 1. 管理员校验（防御性检查）
    if (!openid) {
      return { success: false, message: '无法获取用户身份，请重试' }
    }
    const adminRes = await db.collection('admin_whitelist')
      .where({ openid: openid, status: 1 })
      .limit(1)
      .get()

    if (adminRes.data.length === 0) {
      console.log('[generateTableQRCode] 非管理员请求，拒绝')
      return { success: false, message: '无权访问，仅管理员可生成二维码' }
    }

    // 2. 查询桌位记录
    const tableRes = await db.collection('tables').doc(tableId).get()
    if (!tableRes.data) {
      return { success: false, message: '桌位不存在' }
    }
    const table = tableRes.data
    const code = table.code

    if (!code) {
      return { success: false, message: '桌位 code 为空，请先创建桌位' }
    }

    console.log('[generateTableQRCode] 桌位:', table.name, ', code:', code)

    // 3. 获取 access_token
    const accessToken = await getAccessToken()

    // 4. 调用 getwxacodeunlimit 生成小程序码
    const scene = 't=' + code
    const page = 'pages/index/index'
    // 映射 MINIPROGRAM_STATE (developer/trial/formal) → getwxacodeunlimit env_version (develop/trial/release)
    const stateMap = { developer: 'develop', trial: 'trial', formal: 'release' };
    const rawState = process.env.MINIPROGRAM_STATE || 'trial';
    const envVersion = stateMap[rawState] || 'trial';

    console.log('[generateTableQRCode] 生成小程序码, scene:', scene, ', env_version:', envVersion)

    const qrBuffer = await getWxacodeUnlimit(accessToken, scene, page, envVersion)

    console.log('[generateTableQRCode] 小程序码生成成功, 大小:', qrBuffer.length, 'bytes')

    // 5. 上传到云存储
    const cloudPath = 'tables/qr/' + code + '.png'
    const uploadRes = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: qrBuffer
    })

    const qrFileID = uploadRes.fileID
    console.log('[generateTableQRCode] 上传云存储成功, fileID:', qrFileID)

    // 6. 获取临时 URL 供前端预览
    const tempRes = await cloud.getTempFileURL({ fileList: [qrFileID] })
    const tempURL = (tempRes.fileList && tempRes.fileList[0]) ? tempRes.fileList[0].tempFileURL : ''

    // 7. 更新桌位记录的 qrFileID
    await db.collection('tables').doc(tableId).update({
      data: {
        qrFileID: qrFileID,
        updatedAt: Date.now()
      }
    })

    console.log('[generateTableQRCode] 桌位记录更新完成')

    return {
      success: true,
      tableId: tableId,
      code: code,
      qrFileID: qrFileID,
      tempURL: tempURL
    }

  } catch (err) {
    console.error('[generateTableQRCode] 处理失败:', err.message)
    return {
      success: false,
      message: err.message || '生成二维码失败'
    }
  }
}
