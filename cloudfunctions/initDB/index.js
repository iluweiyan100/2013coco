const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 初始化数据库集合 & 写入数据
 * action: 'init'  — 仅检查/创建集合（不传 action 也默认执行）
 * action: 'setHeroImages' — 写入 heroImages，参数 images: string[]
 */
exports.main = async (event, context) => {
  const db = cloud.database()
  const action = event.action || 'init'

  if (action === 'setHeroImages') {
    const images = event.images || []
    try {
      // 尝试更新已有文档
      const res = await db.collection('heroImages').doc('config').get()
      await db.collection('heroImages').doc('config').set({ data: { images } })
    } catch (e) {
      // 文档或集合不存在，直接 add（云函数端可自动创建集合）
      await db.collection('heroImages').add({ data: { _id: 'config', images } })
    }
    return { success: true }
  }

  // action === 'init'：确保集合和初始文档存在
  try {
    await db.collection('heroImages').limit(1).get()
  } catch (e) {
    // 集合不存在，创建集合并写入初始文档
    await db.collection('heroImages').add({ data: { _id: 'config', images: [] } })
  }
  return { success: true, action: 'init' }
}
