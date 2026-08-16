// utils/tableOrder.js
// 桌位共享桌单客户端封装：加入/心跳/加菜/改数量/结算/实时监听

// 是否处于桌位模式（扫过桌位码且已解析出 tableId）
function isTableMode() {
  const app = getApp()
  const ctx = (app && app.globalData.tableContext) || wx.getStorageSync('tableContext') || null
  return !!(ctx && ctx.tableId)
}

function getTableId() {
  const app = getApp()
  const ctx = (app && app.globalData.tableContext) || wx.getStorageSync('tableContext') || null
  return ctx ? ctx.tableId : ''
}

function getTableName() {
  const app = getApp()
  const ctx = (app && app.globalData.tableContext) || wx.getStorageSync('tableContext') || null
  return ctx ? (ctx.tableName || '') : ''
}

async function call(action, data = {}) {
  const res = await wx.cloud.callFunction({
    name: 'tableOrder',
    data: Object.assign({ action, tableId: getTableId() }, data),
  })
  const r = res.result || {}
  if (!r.success) {
    const err = new Error(r.message || '操作失败')
    err.code = r.code || 'ERROR'
    throw err
  }
  return r
}

function join(tableId) {
  return call('joinTableSession', { tableId, tableName: getTableName() })
}
function heartbeat(tableId) {
  return call('tableHeartbeat', { tableId })
}
function getSession(tableId) {
  return call('getTableSession', { tableId, tableName: getTableName() })
}
function addItem(tableId, item) {
  return call('addTableItem', { tableId, item })
}
function updateQty(tableId, uid, qty) {
  return call('updateTableItemQty', { tableId, uid, qty })
}
function removeItem(tableId, uid) {
  return call('removeTableItem', { tableId, uid })
}
function startCheckout(tableId) {
  return call('startTableCheckout', { tableId })
}
function releaseCheckout(tableId, orderId) {
  return call('releaseTableCheckout', { tableId, orderId: orderId || '' })
}
function completeCheckout(tableId, orderId) {
  return call('completeTableCheckout', { tableId, orderId: orderId || '' })
}
// 分开付（只付自己点的）
function startSplitCheckout(tableId) {
  return call('startSplitCheckout', { tableId })
}
function releaseSplitCheckout(tableId, orderId) {
  return call('releaseSplitCheckout', { tableId, orderId: orderId || '' })
}
function completeSplitCheckout(tableId, orderId) {
  return call('completeSplitCheckout', { tableId, orderId: orderId || '' })
}
function bindTableCheckout(tableId, orderId) {
  return call('bindTableCheckout', { tableId, orderId: orderId || '' })
}
function clearTable(tableId) {
  return call('clearTableSession', { tableId })
}

// 实时监听桌单变化，onChange(doc) 收到最新桌单对象
function watch(tableId, { onChange, onError } = {}) {
  const db = wx.cloud.database()
  return db.collection('table_sessions').doc(tableId).watch({
    onChange: snapshot => {
      const doc = snapshot.docs && snapshot.docs[0]
      if (doc && onChange) onChange(doc)
    },
    onError: err => {
      if (onError) onError(err)
    },
  })
}

module.exports = {
  isTableMode,
  getTableId,
  getTableName,
  join,
  heartbeat,
  getSession,
  addItem,
  updateQty,
  removeItem,
  startCheckout,
  releaseCheckout,
  completeCheckout,
  startSplitCheckout,
  releaseSplitCheckout,
  completeSplitCheckout,
  bindTableCheckout,
  clearTable,
  watch,
}
