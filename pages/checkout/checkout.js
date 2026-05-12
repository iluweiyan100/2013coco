// checkout.js
const ORDER_STORE_KEY = 'co_orders';

Page({
  data: {
    cartList: [],
    orderType: 'dine-in',
    remark: '',
    totalPrice: '0',
    totalCount: 0,
    paying: false
  },

  onLoad(options) {
    if (options && options.data) {
      try {
        const parsed = JSON.parse(decodeURIComponent(options.data));
        this.setData({
          cartList: parsed.cartList || [],
          orderType: parsed.orderType || 'dine-in',
          remark: parsed.remark || '',
          totalPrice: parsed.totalPrice || '0',
          totalCount: parsed.totalCount || 0
        });
      } catch (e) {
        console.error('checkout params parse error', e);
      }
    }
  },

  // 立即支付
  onPay() {
    if (this.data.paying) return;
    if (this.data.cartList.length === 0) return;
    this.setData({ paying: true });

    // 模拟支付流程（实际项目接入 wx.requestPayment）
    // wx.requestPayment({ ... }) 替换下方 setTimeout 即可
    setTimeout(() => {
      this._createOrder();
    }, 800);
  },

  // 生成订单并保存
  _createOrder() {
    const { cartList, orderType, remark, totalPrice } = this.data;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const date = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    // 生成取单号 A01–Z99 随机
    const letters = 'ABCDEFGH';
    const pickupNumber = letters[Math.floor(Math.random() * letters.length)] +
      String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');

    const newOrder = {
      id: Date.now(),
      pickupNumber,
      date,
      time,
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

    // 读取已有订单，追加后写回
    try {
      const existing = wx.getStorageSync(ORDER_STORE_KEY) || [];
      existing.unshift(newOrder);
      wx.setStorageSync(ORDER_STORE_KEY, existing);
    } catch (e) {
      console.error('save order error', e);
    }

    this.setData({ paying: false });

    wx.showToast({ title: '支付成功', icon: 'success', duration: 1200 });

    // 延迟跳转到订单页
    setTimeout(() => {
      // 清空购物车（返回两级：checkout → cart → order）
      wx.reLaunch({ url: '/pages/orders/orders' });
    }, 1400);
  }
});
