// cart.js
const app = getApp();

Page({
  data: {
    remark: '',
    dineInList: [],
    takeawayList: [],
    totalPrice: '0',
    totalCount: 0
  },

  onLoad() {
    this._syncFromGlobal();
  },

  onShow() {
    this._syncFromGlobal();
  },

  // 从 globalData 同步购物车数据，按 orderType 分组
  _syncFromGlobal() {
    const cartItems = app.globalData.cartItems || [];
    const dineInList = cartItems.filter(i => i.orderType === 'dine-in');
    const takeawayList = cartItems.filter(i => i.orderType === 'takeaway');
    this.setData({ dineInList, takeawayList });
    this._refreshTotal(cartItems);
  },

  // 回写到 globalData
  _syncToGlobal(list) {
    app.globalData.cartItems = list;
    const dineInList = list.filter(i => i.orderType === 'dine-in');
    const takeawayList = list.filter(i => i.orderType === 'takeaway');
    this.setData({ dineInList, takeawayList });
    this._refreshTotal(list);
  },

  // 增加数量
  onIncQty(e) {
    const uid = e.currentTarget.dataset.uid;
    const list = (app.globalData.cartItems || []).map(item => {
      if (item.uid === uid) return { ...item, qty: item.qty + 1 };
      return item;
    });
    this._syncToGlobal(list);
  },

  // 减少数量
  onDecQty(e) {
    const uid = e.currentTarget.dataset.uid;
    const list = (app.globalData.cartItems || []).map(item => {
      if (item.uid === uid) return { ...item, qty: item.qty - 1 };
      return item;
    }).filter(item => item.qty > 0);
    this._syncToGlobal(list);
  },

  // 备注
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // 去点单
  onGoOrder() {
    wx.navigateBack({ delta: 1 });
  },

  // 立即支付：分笔生成订单（堂食一笔 + 外带一笔）
  onPayNow() {
    const { dineInList, takeawayList, remark } = this.data;
    const totalItems = [...dineInList, ...takeawayList];
    if (totalItems.length === 0) return;

    // TODO: 实际项目需先请求服务端获取预付单参数
    wx.requestPayment({
      timeStamp: '',
      nonceStr: '',
      package: '',
      signType: 'MD5',
      paySign: '',
      success: () => {
        const orders = [];
        if (dineInList.length > 0) {
          orders.push(this._buildOrder(dineInList, 'dine-in', remark));
        }
        if (takeawayList.length > 0) {
          orders.push(this._buildOrder(takeawayList, 'takeaway', remark));
        }
        this._saveOrders(orders);
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
        wx.showToast({ title: '支付失败，请重试', icon: 'none' });
      }
    });
  },

  // 构建单笔订单对象
  _buildOrder(items, orderType, remark) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const letters = 'ABCDEFGH';
    const pickupNumber = letters[Math.floor(Math.random() * letters.length)] +
      String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    const totalAmount = items.reduce((s, i) => s + parseFloat(i.price) * i.qty, 0);

    return {
      id: Date.now() + Math.random(),
      pickupNumber,
      date: `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      orderType: orderType === 'dine-in' ? '堂食' : '外带',
      status: 'making',
      statusText: '制作中',
      remark,
      products: items.map(item => ({
        name: item.name,
        option: item.spec || '',
        quantity: item.qty,
        price: parseFloat(item.price) * item.qty
      })),
      totalAmount: parseFloat(totalAmount.toFixed(2))
    };
  },

  // 保存订单列表并跳转
  _saveOrders(orders) {
    try {
      const ORDER_KEY = 'co_orders';
      const list = wx.getStorageSync(ORDER_KEY) || [];
      orders.forEach(o => list.unshift(o));
      wx.setStorageSync(ORDER_KEY, list);
    } catch (e) { console.error(e); }

    // 清空购物车
    app.globalData.cartItems = [];

    wx.showToast({ title: '支付成功', icon: 'success', duration: 1200 });
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/orders/orders' });
    }, 1400);
  },

  // 重新计算合计
  _refreshTotal(list) {
    const l = list || [];
    const totalCount = l.reduce((s, i) => s + i.qty, 0);
    const totalPrice = l.reduce((s, i) => s + parseFloat(i.price) * i.qty, 0).toFixed(0);
    this.setData({ totalCount, totalPrice });
  }
});
