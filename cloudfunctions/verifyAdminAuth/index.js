// 云函数入口文件 - 验证管理员身份
const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  console.log('[verifyAdminAuth] 验证管理员身份, openid:', openid)

  try {
    // 查询白名单中是否存在该用户
    const res = await db.collection('admin_whitelist')
      .where({
        openid: openid,
        status: 1  // 只查询启用的管理员
      })
      .get()

    if (res.data.length === 0) {
      console.log('[verifyAdminAuth] 用户不在白名单中')
      return {
        success: true,
        authorized: false,
        message: '无权访问管理后台'
      }
    }

    const admin = res.data[0]
    console.log('[verifyAdminAuth] 验证成功:', { name: admin.name, role: admin.role })

    return {
      success: true,
      authorized: true,
      data: {
        name: admin.name,
        role: admin.role
      }
    }
  } catch (err) {
    console.error('[verifyAdminAuth] 验证失败:', err)
    return {
      success: false,
      authorized: false,
      message: '验证失败'
    }
  }
}
