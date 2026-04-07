// cart.js
Page({
  data: {
    orderType: 'dine-in',
    remark: '',
    cartList: [
      {
        uid: '1',
        name: '经典热可可',
        image: '/assets/CodeBubbyAssets/4_745/3.svg',
        price: '28',
        temp: '热',
        qty: 1
      },
      {
        uid: '2',
        name: '拿铁咖啡',
        image: '/assets/CodeBubbyAssets/4_745/18.svg',
        price: '30',
        temp: '冰',
        qty: 2
      }
    ],
    totalPrice: '88',
    totalCount: 3
  },

  onLoad(options) {
    if (options && options.type) {
      this.setData({ orderType: options.type });
    }
    this._refreshTotal();
  },

  // 增加数量
  onIncQty(e) {
    const uid = e.currentTarget.dataset.uid;
    const list = this.data.cartList.map(item => {
      if (item.uid === uid) return { ...item, qty: item.qty + 1 };
      return item;
    });
    this.setData({ cartList: list });
    this._refreshTotal();
  },

  // 减少数量
  onDecQty(e) {
    const uid = e.currentTarget.dataset.uid;
    let list = this.data.cartList.map(item => {
      if (item.uid === uid) return { ...item, qty: item.qty - 1 };
      return item;
    }).filter(item => item.qty > 0);
    this.setData({ cartList: list });
    this._refreshTotal();
  },

  // 备注
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // 去点单
  onGoOrder() {
    wx.navigateBack({ delta: 1 });
  },

  // 立即支付：直接拉起微信支付，成功后生成订单
  onPayNow() {
    if (this.data.cartList.length === 0) return;
    const { cartList, orderType, remark, totalPrice } = this.data;

    // TODO: 实际项目需先请求服务端获取预付单参数（timeStamp/nonceStr/package/signType/paySign）
    wx.requestPayment({
      timeStamp: '',
      nonceStr: '',
      package: '',
      signType: 'MD5',
      paySign: '',
      success: () => {
        this._createOrder(cartList, orderType, remark, totalPrice);
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return; // 用户主动取消
        wx.showToast({ title: '支付失败，请重试', icon: 'none' });
      }
    });
  },

  // 生成订单并跳转
  _createOrder(cartList, orderType, remark, totalPrice) {
    const ORDER_KEY = 'co_orders';
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const letters = 'ABCDEFGH';
    const pickupNumber = letters[Math.floor(Math.random() * letters.length)] +
      String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');

    const newOrder = {
      id: Date.now(),
      pickupNumber,
      date: `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      orderType: orderType === 'dine-in' ? '堂食' : '外带',
      status: 'making',
      statusText: '制作中',
      remark,
      products: cartList.map(item => ({
        name: item.name,
        option: item.temp || '',
        quantity: item.qty,
        price: parseFloat(item.price) * item.qty
      })),
      totalAmount: parseFloat(totalPrice)
    };

    try {
      const list = wx.getStorageSync(ORDER_KEY) || [];
      list.unshift(newOrder);
      wx.setStorageSync(ORDER_KEY, list);
    } catch (e) { console.error(e); }

    wx.showToast({ title: '支付成功', icon: 'success', duration: 1200 });
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/orders/orders' });
    }, 1400);
  },

  // 重新计算合计
  _refreshTotal() {
    const list = this.data.cartList;
    const totalCount = list.reduce((s, i) => s + i.qty, 0);
    const totalPrice = list.reduce((s, i) => s + parseFloat(i.price) * i.qty, 0).toFixed(0);
    this.setData({ totalCount, totalPrice });
  }
});
