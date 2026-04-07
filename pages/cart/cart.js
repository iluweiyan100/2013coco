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

  // 提交订单
  onSubmitOrder() {
    if (this.data.cartList.length === 0) return;
    wx.showToast({ title: '订单提交成功', icon: 'success' });
  },

  // 重新计算合计
  _refreshTotal() {
    const list = this.data.cartList;
    const totalCount = list.reduce((s, i) => s + i.qty, 0);
    const totalPrice = list.reduce((s, i) => s + parseFloat(i.price) * i.qty, 0).toFixed(0);
    this.setData({ totalCount, totalPrice });
  }
});
