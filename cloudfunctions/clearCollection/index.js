const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })
const db = cloud.database()

exports.main = async (event, context) => {
  console.log('Received event:', JSON.stringify(event))

  // 鉴权：仅店员/管理员可清空集合
  const openid = cloud.getWXContext().OPENID
  const [staff, admin] = await Promise.all([
    db.collection('staff_whitelist').where({ openid, status: 1 }).limit(1).get().catch(() => ({ data: [] })),
    db.collection('admin_whitelist').where({ openid, status: 1 }).limit(1).get().catch(() => ({ data: [] }))
  ])
  const authorized = (staff.data && staff.data.length > 0) || (admin.data && admin.data.length > 0)
  if (!authorized) {
    return { success: false, error: '无权限' }
  }

  const collectionName = event.collectionName || event

  if (!collectionName) {
    console.error('Collection name is missing, event:', event)
    return {
      success: false,
      error: 'Collection name is required'
    }
  }

  try {
    // 查询所有文档
    const res = await db.collection(collectionName).get()
    const docs = res.data

    // 逐个删除
    for (const doc of docs) {
      await db.collection(collectionName).doc(doc._id).remove()
    }

    return {
      success: true,
      deletedCount: docs.length
    }
  } catch (err) {
    console.error('清空集合失败:', err)
    return {
      success: false,
      error: err.message
    }
  }
}
