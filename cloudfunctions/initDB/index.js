const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud3-d2gbcvyqkbc0fbf94' })

/**
 * 初始化数据库集合 & 写入数据
 * action: 'init'              — 仅检查/创建集合
 * action: 'setHeroImages'     — 写入 heroImages，参数 images: string[]
 * action: 'setHomeSettings'   — 写入 homeSettings，参数 wifiName, wifiPassword
 * action: 'toggleClosed'      — 切换打烊状态，参数 manualClosed, manualClosedUntil
 * action: 'setShareConfig'    — 写入 share_config，参数 shareTitle, timelineTitle, shareImage, timelineImage, path
 * action: 'addProduct'        — 新增商品，参数 product: object
 * action: 'updateProduct'     — 更新商品，参数 id: string, product: object
 * action: 'deleteProduct'     — 删除商品，参数 id: string
 * action: 'getProducts'       — 获取所有商品（按 sortOrder 排序）
 * action: 'getTables'         — 获取所有桌位
 * action: 'addTable'          — 新增桌位，参数 name: string
 * action: 'updateTable'       — 更新桌位，参数 id: string, name?, enabled?
 * action: 'deleteTable'       — 删除桌位，参数 id: string
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
    const { wifiName, wifiPassword, openingTime, closingTime, closedTitle, closedMessage } = event
    const data = { updateTime: db.serverDate() }
    if (wifiName !== undefined) data.wifiName = wifiName
    if (wifiPassword !== undefined) data.wifiPassword = wifiPassword
    if (openingTime !== undefined) data.openingTime = openingTime
    if (closingTime !== undefined) data.closingTime = closingTime
    if (closedTitle !== undefined) data.closedTitle = closedTitle
    if (closedMessage !== undefined) data.closedMessage = closedMessage
    try {
      await db.collection('homeSettings').doc('config').get()
      await db.collection('homeSettings').doc('config').update({ data })
    } catch (e) {
      await db.collection('homeSettings').add({ data: { _id: 'config', ...data, wifiName: '', wifiPassword: '' } })
    }
    return { success: true }
  }

  // 切换打烊状态
  if (action === 'toggleClosed') {
    const { manualClosed, manualClosedUntil } = event
    const data = { manualClosed, manualClosedUntil: manualClosedUntil || null, manualClosedDate: new Date().toISOString().slice(0, 10), updateTime: db.serverDate() }
    try {
      await db.collection('homeSettings').doc('config').get()
      await db.collection('homeSettings').doc('config').update({ data })
    } catch (e) {
      await db.collection('homeSettings').add({ data: { _id: 'config', ...data } })
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

  if (action === 'createIndexes') {
    // 为 orders 集合创建复合索引 status + createTime
    try {
      await db.collection('orders').createIndex({
        keys: [{ field: 'status', direction: 1 }, { field: 'createTime', direction: 1 }],
        name: 'idx_status_createTime'
      })
    } catch (e) {
      // 索引已存在则忽略
      if (e.errCode !== -502002) throw e
    }
    return { success: true, message: '索引创建完成' }
  }

  if (action === 'getActiveOrders') {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600000)
    const res = await db.collection('orders')
      .where({
        status: db.command.in(['making', 'ready', 'done']),
        createTime: db.command.gte(twoWeeksAgo)
      })
      .orderBy('createTime', 'asc')
      .limit(200)
      .get()
    return { success: true, data: res.data }
  }

  if (action === 'getProducts') {
    const res = await db.collection('products')
      .orderBy('sortOrder', 'asc')
      .orderBy('createdAt', 'asc')
      .limit(200)
      .get()
    return { success: true, data: res.data }
  }

  // 批量更新商品排序
  if (action === 'updateSortOrder') {
    const updates = event.updates || []
    for (const item of updates) {
      await db.collection('products').doc(item._id).update({
        data: { sortOrder: item.sortOrder }
      })
    }
    return { success: true, updated: updates.length }
  }

  // ===== 首页商品展示 =====
  if (action === 'getFeaturedProducts') {
    try {
      const res = await db.collection('featuredProducts').doc('config').get()
      const items = res.data.items || []
      // 同时查出商品名称
      const productIds = items.map(i => i.productId).filter(Boolean)
      let nameMap = {}
      if (productIds.length > 0) {
        const prodRes = await db.collection('products').where({
          _id: db.command.in(productIds)
        }).get()
        ;(prodRes.data || []).forEach(p => { nameMap[p._id] = p.name })
      }
      return {
        success: true,
        data: items.map(item => ({
          ...item,
          name: nameMap[item.productId] || '',
        })),
      }
    } catch (e) {
      if (e.errCode === -502005) {
        return { success: true, data: [] }
      }
      throw e
    }
  }

  if (action === 'setFeaturedProducts') {
    const items = event.items || []
    try {
      await db.collection('featuredProducts').doc('config').get()
      await db.collection('featuredProducts').doc('config').set({
        data: { items, updateTime: db.serverDate() }
      })
    } catch (e) {
      // 集合或文档不存在时创建
      if (e.errCode === -502005) {
        await db.createCollection('featuredProducts')
      }
      await db.collection('featuredProducts').add({
        data: { _id: 'config', items, updateTime: db.serverDate() }
      })
    }
    return { success: true }
  }

  // ===== 桌面点单二维码管理 =====
  if (action === 'getTableByCode') {
    const { code } = event
    if (!code) return { success: false, data: null, message: '缺少 code' }
    try {
      const res = await db.collection('tables').where({ code, enabled: true }).limit(1).get()
      if (res.data && res.data.length > 0) {
        return { success: true, data: res.data[0] }
      }
      return { success: true, data: null }
    } catch (e) {
      if (e.errCode === -502005) return { success: true, data: null }
      throw e
    }
  }

  if (action === 'getTables') {
    try {
      const res = await db.collection('tables')
        .where({ code: db.command.neq('') })
        .orderBy('createdAt', 'asc')
        .limit(200)
        .get()
      return { success: true, data: res.data }
    } catch (e) {
      if (e.errCode === -502005) {
        return { success: true, data: [] }
      }
      throw e
    }
  }

  if (action === 'addTable') {
    const { name } = event
    if (!name || !name.trim()) {
      return { success: false, message: '请输入桌位名称' }
    }
    // 生成 6 位 base36 随机码
    let code
    for (let i = 0; i < 5; i++) {
      code = Math.random().toString(36).slice(2, 8)
      const dup = await db.collection('tables').where({ code }).limit(1).get()
      if (dup.data.length === 0) break
    }
    const now = Date.now()
    const res = await db.collection('tables').add({
      data: {
        name: name.trim(),
        code: code,
        qrFileID: '',
        enabled: true,
        createdAt: now,
        updatedAt: now
      }
    })
    return { success: true, id: res._id, code: code }
  }

  if (action === 'updateTable') {
    const { id, name, enabled } = event
    if (!id) return { success: false, message: '缺少参数 id' }
    const updateData = { updatedAt: Date.now() }
    if (name !== undefined) updateData.name = name.trim()
    if (enabled !== undefined) updateData.enabled = !!enabled
    await db.collection('tables').doc(id).update({ data: updateData })
    return { success: true }
  }

  if (action === 'deleteTable') {
    const { id } = event
    if (!id) return { success: false, message: '缺少参数 id' }
    // 读取 doc 获取 qrFileID，用于删除云存储文件
    try {
      const doc = await db.collection('tables').doc(id).get()
      if (doc.data && doc.data.qrFileID) {
        try {
          await cloud.deleteFile({ fileList: [doc.data.qrFileID] })
        } catch (e) {
          console.warn('[initDB] 删除 QR 云存储文件失败（忽略）:', e.message)
        }
      }
    } catch (e) {
      // doc 不存在也会抛错，直接尝试删集合中的 doc
    }
    await db.collection('tables').doc(id).remove()
    return { success: true }
  }

  // ===== init：确保集合和初始文档存在 =====
  const ensureCollection = async (name, initialData) => {
    try {
      await db.collection(name).limit(1).get()
    } catch (e) {
      // 集合不存在时先创建集合，再写入初始数据
      if (e.errCode === -502005) {
        await db.createCollection(name)
        await db.collection(name).add({ data: initialData })
      } else {
        await db.collection(name).add({ data: initialData })
      }
    }
  }
  await ensureCollection('heroImages', { _id: 'config', images: [] })
  await ensureCollection('featuredProducts', { _id: 'config', items: [] })
  await ensureCollection('staff_heartbeat', { _id: '_placeholder', openid: '_placeholder', lastSeen: new Date() })
  await ensureCollection('tables', { _id: '_placeholder', name: '', code: '', qrFileID: '', enabled: true, createdAt: Date.now(), updatedAt: Date.now() })
  return { success: true, action: 'init' }
}
