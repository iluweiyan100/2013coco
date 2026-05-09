const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

/**
 * 初始化数据库集合 & 写入数据
 * action: 'init'           — 仅检查/创建集合
 * action: 'setHeroImages'  — 写入 heroImages，参数 images: string[]
 * action: 'setHomeSettings' — 写入 homeSettings，参数 wifiName, wifiPassword
 * action: 'setShareConfig'  — 写入 share_config，参数 shareTitle, timelineTitle, shareImage, timelineImage, path
 * action: 'addProduct'     — 新增商品，参数 product: object
 * action: 'updateProduct'  — 更新商品，参数 id: string, product: object
 * action: 'deleteProduct'  — 删除商品，参数 id: string
 * action: 'getProducts'    — 获取所有商品（按 sortOrder 排序）
 */
exports.main = async (event, context) => {
  const db = cloud.database()
  const action = event.action || 'init'

  // ===== 英雄区轮播图 =====
  if (action === 'setHeroImages') {
    const images = event.images || []
    try {
      await db.collection('heroImages').doc('config').get()
      await db.collection('heroImages').doc('config').set({ data: { images } })
    } catch (e) {
      await db.collection('heroImages').add({ data: { _id: 'config', images } })
    }
    return { success: true }
  }

  // ===== 首页设置（Wi-Fi 等）=====
  if (action === 'setHomeSettings') {
    const { wifiName, wifiPassword } = event
    try {
      await db.collection('homeSettings').doc('config').get()
      await db.collection('homeSettings').doc('config').set({
        data: { wifiName, wifiPassword, updateTime: db.serverDate() }
      })
    } catch (e) {
      await db.collection('homeSettings').add({
        data: { _id: 'config', wifiName, wifiPassword, updateTime: db.serverDate() }
      })
    }
    return { success: true }
  }

  // ===== 分享配置 =====
  if (action === 'setShareConfig') {
    const { shareTitle, timelineTitle, shareImage, timelineImage, path } = event
    try {
      await db.collection('share_config').doc('index_share').get()
      await db.collection('share_config').doc('index_share').set({
        data: { shareTitle, timelineTitle, shareImage, timelineImage, path, updateTime: Date.now() }
      })
    } catch (e) {
      await db.collection('share_config').add({
        data: { _id: 'index_share', shareTitle, timelineTitle, shareImage, timelineImage, path, updateTime: Date.now() }
      })
    }
    return { success: true }
  }

  // ===== 商品管理 =====
  if (action === 'addProduct') {
    const product = event.product || {}
    const now = Date.now()
    const res = await db.collection('products').add({
      data: {
        ...product,
        createdAt: now,
        updatedAt: now
      }
    })
    return { success: true, id: res._id }
  }

  if (action === 'updateProduct') {
    const { id, product } = event
    if (!id) return { success: false, error: 'id 必填' }
    await db.collection('products').doc(id).update({
      data: {
        ...product,
        updatedAt: Date.now()
      }
    })
    return { success: true }
  }

  if (action === 'deleteProduct') {
    const { id } = event
    if (!id) return { success: false, error: 'id 必填' }
    await db.collection('products').doc(id).remove()
    return { success: true }
  }

  if (action === 'getProducts') {
    const res = await db.collection('products')
      .orderBy('sortOrder', 'asc')
      .orderBy('createdAt', 'asc')
      .limit(200)
      .get()
    return { success: true, data: res.data }
  }

  // ===== init：确保集合和初始文档存在 =====
  try {
    await db.collection('heroImages').limit(1).get()
  } catch (e) {
    await db.collection('heroImages').add({ data: { _id: 'config', images: [] } })
  }
  return { success: true, action: 'init' }
}
