const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })
const db = cloud.database()

exports.main = async (event, context) => {
  console.log('Received event:', JSON.stringify(event))

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
