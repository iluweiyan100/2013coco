// cart.js
const app = getApp();
const SUBSCRIBE = require('../../config/subscribe.js');
const pay = require('../../utils/pay.js');
const tableOrder = require('../../utils/tableOrder.js');

// 生成自定义订单 _id（创建时即写入 orderId/outTradeNo，避免 post-add update 被安全规则禁止）
function genOrderId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

Page({
  data: {
    statusBarHeight: 0,
    remark: '',
    dineInList: [],
    takeawayList: [],
    totalPrice: '0',
    totalCount: 0,
    // 桌位共享桌单模式
    tableMode: false,
    tableStatus: 'open',      // open | paying | paid
    tablePickupNumber: '',
    tableName: '',
    tableItems: [],           // 全量（含 pending/paying/paid）
    myOpenid: '',
    pendingItems: [],         // 待支付
    paidItems: [],            // 已下单
    pendingCount: 0,          // 待支付件数（全桌）
    pendingTotal: '0',        // 待支付合计（全桌）
    myPendingTotal: '0',      // 我的待支付合计
    myPendingCount: 0,        // 我的待支付件数
    paidCount: 0,             // 已下单件数
    isMultiPayer: false,      // 是否多人点单（决定是否显示分开付）
  },

  onLoad() {
    this.setData({
      statusBarHeight: wx.getWindowInfo().statusBarHeight
    });
    if (tableOrder.isTableMode()) {
      this.setData({ tableMode: true });
      this._startTableSession(tableOrder.getTableId());
    } else {
      this._syncFromGlobal();
    }
  },

  onShow() {
    if (tableOrder.isTableMode()) {
      if (!this.data.tableMode) this.setData({ tableMode: true });
      this._startTableSession(tableOrder.getTableId());
    } else {
      if (this.data.tableMode) this.setData({ tableMode: false });
      this._syncFromGlobal();
    }
  },

  onUnload() {
    this._stopTableWatcher();
  },

  // ===== 桌位共享桌单 =====
  async _startTableSession(tableId) {
    if (this._tableId === tableId && this._tableWatcher) return;
    this._stopTableWatcher();
    this._tableId = tableId;

    try {
      const r = await tableOrder.join(tableId);
      if (r.reset) wx.showToast({ title: '已开启新桌单', icon: 'none', duration: 1500 });
      this._applyTableSession(r.session);
    } catch (e) {
      console.warn('[Cart] 加入桌单失败', e);
      tableOrder.getSession(tableId).then(r => this._applyTableSession(r.session)).catch(() => {});
    }

    this._tableWatcher = tableOrder.watch(tableId, {
      onChange: session => this._applyTableSession(session),
      onError: () => {
        tableOrder.getSession(tableId).then(r => this._applyTableSession(r.session)).catch(() => {});
      }
    });

    this._heartbeatTimer = setInterval(() => {
      if (tableOrder.isTableMode()) tableOrder.heartbeat(tableId).catch(() => {});
    }, 30000);
  },

  _applyTableSession(session) {
    if (!session) return;
    const myOpenid = wx.getStorageSync('openid') || getApp().globalData.openid || '';
    const items = (session.items || []).map(i => ({
      ...i,
      state: i.state || 'pending',
      isMine: (i.addedBy || '') === myOpenid
    }));
    // 待支付组：pending（可编辑）+ paying（结算中冻结显示）
    const pendingItems = items.filter(i => i.state === 'pending' || i.state === 'paying');
    // 已下单组
    const paidItems = items.filter(i => i.state === 'paid');
    // 真正待支付的合计（用于按钮金额/件数，不含结算中）
    const trulyPending = items.filter(i => i.state === 'pending');
    const pendingCount = trulyPending.reduce((s, i) => s + (i.qty || 1), 0);
    const pendingTotal = trulyPending.reduce((s, i) => s + (Number(i.price) || 0) * (i.qty || 1), 0).toFixed(2);
    const myPending = trulyPending.filter(i => i.isMine);
    const myPendingTotal = myPending.reduce((s, i) => s + (Number(i.price) || 0) * (i.qty || 1), 0).toFixed(2);
    const myPendingCount = myPending.reduce((s, i) => s + (i.qty || 1), 0);
    const paidCount = paidItems.reduce((s, i) => s + (i.qty || 1), 0);
    // 多人判定含结算中的条目（pending+paying），否则他人结算中时你的「分开付」按钮会消失、无法付款
    const payers = [...new Set(pendingItems.map(i => i.addedBy).filter(Boolean))];
    const isMultiPayer = payers.length >= 2;
    this.setData({
      myOpenid,
      tableItems: items,
      pendingItems,
      paidItems,
      tableStatus: session.status || 'open',
      tablePickupNumber: session.pickupNumber || '',
      tableName: session.tableName || '',
      pendingCount,
      pendingTotal,
      myPendingTotal,
      myPendingCount,
      paidCount,
      isMultiPayer
    });
  },

  _stopTableWatcher() {
    if (this._tableWatcher) { this._tableWatcher.close(); this._tableWatcher = null; }
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
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
  async onIncQty(e) {
    const uid = e.currentTarget.dataset.uid;
    if (this.data.tableMode) {
      const item = (this.data.tableItems || []).find(i => i.uid === uid);
      if (!item) return;
      if (item.state !== 'pending' || !item.isMine) {
        wx.showToast({ title: '只能修改自己的待支付商品', icon: 'none', duration: 1500 });
        return;
      }
      try {
        await tableOrder.updateQty(tableOrder.getTableId(), uid, (item.qty || 1) + 1);
      } catch (err) {
        wx.showToast({ title: err.message || '操作失败', icon: 'none', duration: 1500 });
      }
      return;
    }
    const list = (app.globalData.cartItems || []).map(item => {
      if (item.uid === uid) return { ...item, qty: item.qty + 1 };
      return item;
    });
    this._syncToGlobal(list);
  },

  // 减少数量
  async onDecQty(e) {
    const uid = e.currentTarget.dataset.uid;
    if (this.data.tableMode) {
      const item = (this.data.tableItems || []).find(i => i.uid === uid);
      if (!item) return;
      if (item.state !== 'pending' || !item.isMine) {
        wx.showToast({ title: '只能修改自己的待支付商品', icon: 'none', duration: 1500 });
        return;
      }
      try {
        await tableOrder.updateQty(tableOrder.getTableId(), uid, (item.qty || 1) - 1);
      } catch (err) {
        wx.showToast({ title: err.message || '操作失败', icon: 'none', duration: 1500 });
      }
      return;
    }
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

  // 返回上一页
  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  // 去点单
  onGoOrder() {
    wx.navigateBack({ delta: 1 });
  },

  // 一起付（桌位模式）：一人付全桌所有未付款点单
  onPayTogether() {
    if (!this.data.tableMode) return;
    // 自己已有在途结算：即时拦截（服务端也会拒绝）
    if (this.data.pendingItems.some(i => i.state === 'paying' && i.isMine)) {
      wx.showToast({ title: '你有正在结算的点单，请先完成或取消', icon: 'none', duration: 1500 });
      return;
    }
    if (this.data.pendingCount === 0) {
      wx.showToast({ title: '本桌没有待支付的点单', icon: 'none', duration: 1500 });
      return;
    }
    this._requestSubscribe(() => {
      this._doTablePay('together');
    });
  },

  // 分开付（桌位模式）：只付自己点的
  onPaySplit() {
    if (!this.data.tableMode) return;
    if (!this.data.isMultiPayer) {
      wx.showToast({ title: '只有一人点单，请用一起付', icon: 'none', duration: 1500 });
      return;
    }
    if (this.data.myPendingCount === 0) {
      wx.showToast({ title: '你没有待支付的点单', icon: 'none', duration: 1500 });
      return;
    }
    this._requestSubscribe(() => {
      this._doTablePay('split');
    });
  },

  // 立即支付（非桌位模式）：先请求订阅授权，再调用云函数创建支付订单
  onPayNow() {
    if (this.data.tableMode) return;  // 桌位模式走 onPayTogether / onPaySplit

    const { dineInList, takeawayList, remark } = this.data;
    const totalItems = [...dineInList, ...takeawayList];
    if (totalItems.length === 0) return;

    // 步骤1：请求订阅消息授权（必须在同步调用栈中，不可放在 await 之后）
    this._requestSubscribe(() => {
      this._doPay(dineInList, takeawayList, remark);
    });
  },

  /**
   * 请求订阅消息授权（同步调用栈中触发，不可 await）
   */
  _requestSubscribe(callback) {
    wx.requestSubscribeMessage({
      tmplIds: [SUBSCRIBE.PAYMENT_SUCCESS, SUBSCRIBE.PICKUP_NOTIFY],
      success: (res) => {
        const payAccepted = res[SUBSCRIBE.PAYMENT_SUCCESS] === 'accept';
        const pickupAccepted = res[SUBSCRIBE.PICKUP_NOTIFY] === 'accept';
        console.log('[Subscribe] 付款成功通知:', payAccepted ? '已授权' : '已拒绝',
                     '取餐通知:', pickupAccepted ? '已授权' : '已拒绝');
      },
      fail: (err) => {
        console.warn('[Subscribe] 订阅消息授权失败:', err);
      },
      complete: () => {
        callback();
      },
    });
  },

  // ===== 桌位模式：一起付 / 分开付 =====
  async _doTablePay(mode) {
    const tableId = tableOrder.getTableId();
    if (!tableId || this._paying) return;
    this._paying = true;

    let checkout = null;
    try {
      wx.showLoading({ title: '正在结算...', mask: true });
      checkout = mode === 'split'
        ? await tableOrder.startSplitCheckout(tableId)
        : await tableOrder.startCheckout(tableId);
    } catch (e) {
      wx.hideLoading();
      this._paying = false;
      wx.showToast({ title: e.message || '结算失败', icon: 'none', duration: 2000 });
      return;
    }

    let orderId = '';
    try {
      // 1. 创建一张订单（pending）：一起付合并全桌、分开付只含本人条目
      orderId = await this._createTableOrder(checkout, mode);

      // 1.5 回写结算锁对应订单 id（供超时恢复/幂等判断；等待完成后再发起支付，缩小「无 lockOrderId」窗口）
      await tableOrder.bindTableCheckout(tableId, orderId).catch(() => {});

      // 2. 统一下单
      const paymentRes = await wx.cloud.callFunction({
        name: 'createPayment',
        data: {
          totalAmount: checkout.totalAmount,
          orderId: orderId,
          orderIds: [orderId],
          openid: wx.getStorageSync('openid')
        }
      });

      wx.hideLoading();

      if (!paymentRes.result || !paymentRes.result.paymentParams) {
        throw new Error('获取支付参数失败');
      }

      // 3. 调起微信支付
      const params = paymentRes.result.paymentParams;
      await wx.requestPayment({
        timeStamp: params.timeStamp,
        nonceStr: params.nonceStr,
        package: params.package,
        signType: params.signType,
        paySign: params.paySign
      });

      // 4. 支付成功：由服务端校验支付并完成桌单（complete 内部查微信 + 写订单 making + 标记条目 paid）
      const finished = await this._finishTablePay(mode, tableId, orderId);
      if (!finished) {
        wx.showToast({ title: '支付成功，确认中…', icon: 'none', duration: 2500 });
      }

    } catch (e) {
      wx.hideLoading();
      console.error('[TablePay] 支付流程失败:', e);
      const isCancel = !!(e.errMsg && e.errMsg.indexOf('cancel') !== -1);

      if (isCancel) {
        // 用户主动取消：无支付发生，释放结算锁 + 删除本张未支付订单（防垃圾数据累积）
        if (mode === 'split') {
          await tableOrder.releaseSplitCheckout(tableId, orderId).catch(() => {});
        } else {
          await tableOrder.releaseCheckout(tableId, orderId).catch(() => {});
        }
        if (orderId) {
          wx.cloud.database().collection('orders').doc(orderId).remove().catch(() => {});
        }
      } else if (orderId) {
        // 非取消：可能是「已扣款但本地报错」。让服务端确认支付；
        // 确认不了就保留锁等 webhook 收尾，绝不误释放（防重复扣款）
        const finished = await this._finishTablePay(mode, tableId, orderId).catch(() => false);
        if (!finished) {
          wx.showToast({ title: '支付结果确认中，请稍后刷新', icon: 'none', duration: 2500 });
        }
      } else {
        wx.showToast({ title: e.message || '支付失败，请重试', icon: 'none', duration: 2000 });
      }
    } finally {
      this._paying = false;
    }
  },

  // 服务端确认支付并完成桌单（complete*Checkout 内部查微信真实状态，未付/查单失败返回 NOT_PAID）
  async _finishTablePay(mode, tableId, orderId) {
    try {
      if (mode === 'split') {
        await tableOrder.completeSplitCheckout(tableId, orderId);
      } else {
        await tableOrder.completeCheckout(tableId, orderId);
      }
    } catch (err) {
      // NOT_PAID：服务端查单未确认成功 → 保留锁等 webhook，返回 false（不抛错、不释放）
      if (err && err.code === 'NOT_PAID') return false;
      throw err;
    }

    // 销量累加（幂等）
    wx.cloud.callFunction({ name: 'initDB', data: { action: 'recordSales', orderIds: [orderId] } })
      .catch(e => console.warn('[Sales] 销量累加失败（可忽略）', e));

    wx.showToast({ title: '支付成功', icon: 'success', duration: 1200 });
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/orders/orders' });
    }, 1400);
    return true;
  },

  // 创建一张桌位订单（一起付合并全桌 / 分开付只含本人条目）
  async _createTableOrder(checkout, mode) {
    const openid = wx.getStorageSync('openid') || getApp().globalData.openid;
    if (!openid) throw new Error('用户未登录，请重新打开小程序');

    const db = wx.cloud.database();
    const items = checkout.items || [];
    // 预生成 _id，创建时即写入 orderId/outTradeNo（安全规则已禁止 post-add update）
    const orderId = genOrderId();
    await db.collection('orders').add({
      data: {
        _id: orderId,
        orderId: orderId,
        outTradeNo: orderId,
        openid: openid,
        pickupNumber: checkout.pickupNumber,
        orderType: 'dine-in',
        status: 'pending',
        remark: this.data.remark || '',
        products: items.map(i => ({
          productId: i.productId || '',
          name: i.name,
          temperature: i.spec || '',
          quantity: i.qty || 1,
          price: (i.price || 0) * (i.qty || 1)
        })),
        totalAmount: checkout.totalAmount,
        createTime: db.serverDate(),
        tableId: tableOrder.getTableId(),
        tableName: tableOrder.getTableName(),
        // 分开付：只有付款人可见；一起付：结算时在场的同桌成员都可见
        memberOpenids: (mode === 'split')
          ? [openid]
          : (checkout.memberOpenids && checkout.memberOpenids.length ? checkout.memberOpenids : [openid]),
        // 本次结算锁定的条目 uid（供支付回调精确标记已付）
        tableItemUids: (mode === 'split')
          ? (checkout.uidList || items.map(i => i.uid))
          : items.map(i => i.uid)
      }
    });
    return orderId;
  },

  /**
   * 执行实际支付流程（非桌位模式，复用 utils/pay.js 的服务端唯一取餐码逻辑）
   */
  async _doPay(dineInList, takeawayList, remark) {
    const orderGroups = [];
    if (dineInList.length > 0) {
      orderGroups.push({ items: dineInList, orderType: 'dine-in', remark });
    }
    if (takeawayList.length > 0) {
      orderGroups.push({ items: takeawayList, orderType: 'takeaway', remark });
    }
    pay.executePay(orderGroups, () => {
      // 支付成功：清空本地购物车并跳转订单页
      app.globalData.cartItems = [];
      wx.showToast({ title: '支付成功', icon: 'success', duration: 1200 });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/orders/orders' });
      }, 1400);
    });
  },

  // 重新计算合计
  _refreshTotal(list) {
    const l = list || [];
    const totalCount = l.reduce((s, i) => s + i.qty, 0);
    const totalPrice = l.reduce((s, i) => s + parseFloat(String(i.price).replace(/[^\d.]/g, '')) * i.qty, 0).toFixed(2);
    this.setData({ totalCount, totalPrice });
  }
});
