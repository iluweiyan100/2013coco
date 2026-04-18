const cloud = require('wx-server-sdk')

cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { nickName, avatarUrl, phone } = event
  const openid = wxContext.OPENID

  // 更新用户信息
  const updateTime = db.serverDate()
  const updateData = {
    nickName,
    avatarUrl,
    updateTime
  }
  // 只有当 phone 不为空时才更新手机号
  if (phone !== undefined && phone !== null) {
    updateData.phone = phone
  }

  const updateRes = await db.collection('users').where({
    openid
  }).update({
    data: updateData
  })

  // 返回最新的用户信息
  const userRes = await db.collection('users').where({
    openid
  }).get()

  return {
    openid,
    success: true,
    user: userRes.data[0]
  }
}
