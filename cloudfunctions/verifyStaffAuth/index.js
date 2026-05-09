// 云函数入口文件 - 验证店员身份
const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  console.log('[verifyStaffAuth] 验证店员身份, openid:', openid)

  try {
    // 查询白名单中是否存在该用户
    const res = await db.collection('staff_whitelist')
      .where({
        openid: openid,
        status: 1  // 只查询启用的店员
      })
      .get()

    if (res.data.length === 0) {
      console.log('[verifyStaffAuth] 用户不在白名单中')
      return {
        success: true,
        authorized: false,
        message: '无权访问店员端'
      }
    }

    const staff = res.data[0]
    console.log('[verifyStaffAuth] 验证成功:', { name: staff.name, role: staff.role })

    return {
      success: true,
      authorized: true,
      data: {
        name: staff.name,
        role: staff.role
      }
    }
  } catch (err) {
    console.error('[verifyStaffAuth] 验证失败:', err)
    return {
      success: false,
      authorized: false,
      message: '验证失败'
    }
  }
}
