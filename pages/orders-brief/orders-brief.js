// pages/orders-brief/orders-brief.js
Page({
  data: {
    statusBarHeight: 0,
    orders: []
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });
    this.loadOrders();
  },

  onShow() {
    this.loadOrders();
  },

  // 返回上一页
  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  // 加载订单数据
  async loadOrders() {
    try {
      const openid = wx.getStorageSync('openid');
      if (!openid) {
        this.setData({ orders: [] });
        return;
      }

      const db = wx.cloud.database();
      const res = await db.collection('orders')
        .where({
          openid: openid,
          status: db.command.in(['making', 'completed'])
        })
        .orderBy('createTime', 'desc')
        .get();

      const orders = (res.data || []).map(order => {
        // 生成商品简要信息（最多显示2个商品）
        const productCount = order.products.reduce((sum, p) => sum + p.quantity, 0);
        const productNames = order.products.slice(0, 2).map(p => p.name);
        let productSummary = productNames.join('、');
        if (order.products.length > 2) {
          productSummary += '等';
        }

        return {
          id: order._id,
          pickupNumber: order.pickupNumber,
          date: this._formatDate(order.createTime),
          time: this._formatTime(order.createTime),
          orderType: order.orderType,
          productSummary: productSummary,
          productCount: productCount,
          totalAmount: order.totalAmount
        };
      });

      this.setData({ orders });
    } catch (e) {
      console.error('[OrdersBrief] 加载订单失败:', e);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 格式化日期
  _formatDate(timestamp) {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day}`;
  },

  // 格式化时间
  _formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
});
