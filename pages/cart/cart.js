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

  // 立即支付：调用云函数创建支付订单
  async onPayNow() {
    const { dineInList, takeawayList, remark } = this.data;
    const totalItems = [...dineInList, ...takeawayList];
    if (totalItems.length === 0) return;

    wx.showLoading({ title: '正在下单...', mask: true });

    try {
      // 1. 先创建订单记录（状态为 pending）
      const orders = [];
      if (dineInList.length > 0) {
        orders.push(this._buildOrder(dineInList, 'dine-in', remark));
      }
      if (takeawayList.length > 0) {
        orders.push(this._buildOrder(takeawayList, 'takeaway', remark));
      }

      const orderIds = await this._createPendingOrders(orders);
      
      // 2. 计算 outTradeNo（≤32字符）并回写到每条订单，供 callback 批量查询
      const totalAmount = orders.reduce((s, o) => s + o.totalAmount, 0);
      const outTradeNo = orderIds.length === 1
        ? orderIds[0]
        : orderIds[0].slice(0, 26) + '_' + orderIds.length;

      // 回写 outTradeNo 到所有关联订单
      const db2 = wx.cloud.database();
      await Promise.all(orderIds.map(id =>
        db2.collection('orders').doc(id).update({ data: { outTradeNo } })
      ));
      
      const paymentRes = await wx.cloud.callFunction({
        name: 'createPayment',
        data: {
          totalAmount: totalAmount,
          orderId: outTradeNo,
          orderIds: orderIds,
          openid: wx.getStorageSync('openid')
        }
      });

      wx.hideLoading();

      if (!paymentRes.result || !paymentRes.result.paymentParams) {
        throw new Error('获取支付参数失败');
      }

      // 3. 调起支付
      const params = paymentRes.result.paymentParams;
      await wx.requestPayment({
        timeStamp: params.timeStamp,
        nonceStr: params.nonceStr,
        package: params.package,
        signType: params.signType,
        paySign: params.paySign
      });

      // 4. 支付成功，清空购物车并跳转
      app.globalData.cartItems = [];
      wx.showToast({ title: '支付成功', icon: 'success', duration: 1200 });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/orders/orders' });
      }, 1400);

    } catch (e) {
      wx.hideLoading();
      console.error('[Pay] 支付流程失败:', e);
      if (e.errMsg && e.errMsg.indexOf('cancel') !== -1) {
        // 用户取消支付，删除pending订单
        await this._deletePendingOrders();
      } else {
        wx.showToast({ 
          title: e.message || '支付失败，请重试', 
          icon: 'none',
          duration: 2000
        });
      }
    }
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
      orderType,  // 直接保持英文 'dine-in' / 'takeaway'
      status: 'making',
      statusText: '制作中',
      remark,
      products: items.map(item => ({
        name: item.name,
        temperature: item.spec || '',  // 与 staff 页面字段对齐
        quantity: item.qty,
        price: parseFloat(item.price) * item.qty
      })),
      totalAmount: parseFloat(totalAmount.toFixed(2))
    };
  },

  // 创建待支付订单记录，返回订单ID数组
  async _createPendingOrders(orders) {
    const openid = wx.getStorageSync('openid');
    const db = wx.cloud.database();

    const orderIds = [];

    // 同一批订单（堂食+外带）共用同一个取餐编号
    const letters = 'ABCDEFGH';
    const sharedPickupNumber = letters[Math.floor(Math.random() * letters.length)] +
      String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');

    for (const order of orders) {
      const res = await db.collection('orders').add({
        data: {
          openid: openid,
          pickupNumber: sharedPickupNumber,
          orderType: order.orderType,  // 已是英文 'dine-in' / 'takeaway'
          status: 'pending',
          remark: order.remark || '',
          products: order.products,
          totalAmount: order.totalAmount,
          createTime: db.serverDate()
        }
      });
      // 写入 orderId 和 outTradeNo 字段，供支付回调查询使用
      await db.collection('orders').doc(res._id).update({
        data: { orderId: res._id, outTradeNo: '' }  // outTradeNo 待拿到后统一回写
      });
      orderIds.push(res._id);
    }

    return orderIds;
  },

  // 删除待支付订单（支付取消时调用）
  async _deletePendingOrders() {
    const openid = wx.getStorageSync('openid');
    const db = wx.cloud.database();
    const _ = db.command;

    try {
      await db.collection('orders')
        .where({
          openid: openid,
          status: 'pending'
        })
        .remove();
    } catch (e) {
      console.warn('[Pay] 删除pending订单失败', e);
    }
  },

  // 重新计算合计
  _refreshTotal(list) {
    const l = list || [];
    const totalCount = l.reduce((s, i) => s + i.qty, 0);
    const totalPrice = l.reduce((s, i) => s + parseFloat(String(i.price).replace(/[^\d.]/g, '')) * i.qty, 0).toFixed(2);
    this.setData({ totalCount, totalPrice });
  }
});
