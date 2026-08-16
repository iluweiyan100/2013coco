// pages/staff/tableManage/tableManage.js
// 桌位管理：清台 / 禁用（恢复）
const tableOrder = require('../../../utils/tableOrder.js')

Page({
  data: {
    statusBarHeight: 0,
    tables: [],           // [{ _id, name, enabled }]
    selectedTableId: '',  // 当前选中的桌位
    selectedTable: null,  // 当前选中桌位对象（供底部按钮文案/样式使用）
  },

  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    this._verifyAccess();
  },

  onShow() {
    // 每次显示刷新，确保禁用/恢复状态最新
    if (this._authorized) this._loadTables();
  },

  // 鉴权：仅店员/管理员可进入（服务端在写操作上还会二次校验）
  async _verifyAccess() {
    try {
      const [staff, admin] = await Promise.all([
        wx.cloud.callFunction({ name: 'verifyStaffAuth' }),
        wx.cloud.callFunction({ name: 'verifyAdminAuth' })
      ]);
      const staffOk = staff.result && staff.result.authorized;
      const adminOk = admin.result && admin.result.authorized;
      if (staffOk || adminOk) {
        this._authorized = true;
        this._loadTables();
        return;
      }
      // 明确未被授权 → 退出
      this._authorized = false;
      wx.showToast({ title: '无权访问', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 800);
    } catch (e) {
      // 鉴权请求失败（网络等）：不拦截，允许进入查看；清台/禁用等写操作由服务端二次校验兜底
      console.warn('[TableManage] 鉴权调用失败，放行查看（写操作服务端兜底）', e);
      this._authorized = true;
      this._loadTables();
    }
  },

  async _loadTables() {
    try {
      const res = await wx.cloud.callFunction({ name: 'initDB', data: { action: 'getTables' } });
      const tables = ((res.result && res.result.data) || []).map(t => ({
        _id: t._id,
        name: t.name || '',
        enabled: t.enabled !== false
      }));
      this.setData({ tables }, () => this._refreshSelected());
    } catch (e) {
      wx.showToast({ title: '加载桌位失败', icon: 'none' });
    }
  },

  // 选中桌位（再点一次取消选中）
  onSelectTable(e) {
    const id = e.currentTarget.dataset.id;
    const nextId = id === this.data.selectedTableId ? '' : id;
    this.setData({ selectedTableId: nextId }, () => this._refreshSelected());
  },

  // 根据 selectedTableId 同步 selectedTable 对象
  _refreshSelected() {
    const { selectedTableId, tables } = this.data;
    const selectedTable = tables.find(t => t._id === selectedTableId) || null;
    this.setData({ selectedTable });
  },

  // 清台（必须确认，强制重置 paid/paying → open）
  async onClearTable() {
    const { selectedTableId, tables } = this.data;
    if (!selectedTableId) {
      wx.showToast({ title: '请先选择桌位', icon: 'none' });
      return;
    }
    const t = tables.find(x => x._id === selectedTableId);
    const name = t ? t.name : '该桌';
    const res = await wx.showModal({
      title: '清台确认',
      content: `确认清空「${name}」的桌单？已下单/结算中的桌单也会被重置，此操作不可恢复。`,
      confirmText: '清台',
      confirmColor: '#A3212D'
    });
    if (!res.confirm) return;

    try {
      await tableOrder.clearTable(selectedTableId);
      wx.showToast({ title: '已清台', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '清台失败', icon: 'none' });
    }
  },

  // 禁用 / 恢复（禁用不确认）
  async onToggleDisable() {
    const { selectedTableId, tables } = this.data;
    if (!selectedTableId) {
      wx.showToast({ title: '请先选择桌位', icon: 'none' });
      return;
    }
    const t = tables.find(x => x._id === selectedTableId);
    if (!t) return;
    const nextEnabled = !t.enabled;

    wx.showLoading({ title: '处理中...', mask: true });
    try {
      await wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'updateTable', id: selectedTableId, enabled: nextEnabled }
      });
      wx.hideLoading();
      wx.showToast({ title: nextEnabled ? '已恢复' : '已禁用', icon: 'success' });
      this._loadTables();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '操作失败', icon: 'none' });
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
