const cloud = require('wx-server-sdk')

cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 查询或创建用户记录
  const userRes = await db.collection('users').where({
    openid
  }).get()

  let user
  if (userRes.data.length === 0) {
    // 首次登录，创建用户记录
    const createTime = db.serverDate()
    const createRes = await db.collection('users').add({
      data: {
        openid,
        nickName: '',
        avatarUrl: '',
        createTime,
        updateTime: createTime
      }
    })
    user = {
      _id: createRes._id,
      openid,
      nickName: '',
      avatarUrl: '',
      createTime,
      updateTime: createTime
    }
  } else {
    user = userRes.data[0]
  }

  return {
    openid,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
    user
  }
}
