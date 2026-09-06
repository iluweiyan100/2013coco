// staff.js - 店员点单窗口
const { formatScoopProduct, refundedAmountOf, netAmountOf } = require('../../utils/orderDisplay.js');

// 音频单例（模块级，跨页面实例复用）
let _audio = null;         // 共享音频实例（解锁与提示音复用同一个，iOS 解锁依赖实例）
let _unlocked = false;     // 是否已完成音频解锁（需用户交互后解锁）

Page({
  data: {
    dineInOrders: [],      // 堂食订单
    takeawayOrders: [],    // 外带订单
    completedOrders: [],   // 已完成订单
    statusBarHeight: 0,    // 状态栏高度
    shopClosed: false,     // 打烊状态
    soundEnabled: false,   // 声音是否已解锁开启
    refundModal: null,     // 退款弹窗：{ orderId, outTradeNo, transactionId, candidates:[{index,name,spec,price,refunded,selected}] }
  },

  onLoad() {
    this.setData({
      statusBarHeight: wx.getWindowInfo().statusBarHeight,
      soundEnabled: _unlocked   // 已解锁则直接隐藏开启横幅
    });

    // 全局忽略 iOS 物理静音键，提示音在静音模式下也能响
    try {
      wx.setInnerAudioOption({ obeyMuteSwitch: false, mixWithOther: true });
    } catch (e) {}

    // 打印当前环境信息
    console.log('[Staff] ========== 初始化信息 ==========');
    console.log('[Staff] 系统信息:', wx.getWindowInfo());
    console.log('[Staff] 云环境 ID:', wx.cloud.DYNAMIC_CURRENT_ENV);

    // 获取当前用户信息
    const openid = wx.getStorageSync('openid');
    console.log('[Staff] 当前用户 openid:', openid);
    console.log('[Staff] globalData openid:', getApp().globalData.openid);

    this._loadInitialOrders();
    this._heartbeat();
    this._loadShopStatus();
    this._startOrderWatcher();

    // 兜底：每 60 秒对账一次（防 watch 断连/后台漏单）+ 心跳（心跳间隔 60 秒）
    this.refreshTimer = setInterval(() => {
      this._loadInitialOrders();
      this._heartbeat();
    }, 60000);
  },

  // 初始加载：获取所有制作中、待取餐和已完成的订单（改走云函数，替代客户端 watch）
  async _loadInitialOrders() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'getActiveOrders' },
      });
      const orders = res.result.data || [];
      this._classifyOrders(orders);
      // 检测新订单并播放提示音（首次加载不播）
      const ids = orders.map(o => o._id);
      if (this._knownOrderIds && ids.some(id => !this._knownOrderIds.includes(id))) {
        this._playNewOrderSound();
      }
      this._knownOrderIds = ids;
      return true;
    } catch (e) {
      console.error('[Staff] 加载初始订单失败', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      return false;
    }
  },

  // 启动新订单事件监听（watch order_events/latest，支付成功时云端写事件 → 即时刷新）
  _startOrderWatcher() {
    try {
      const db = wx.cloud.database();
      this.orderWatcher = db.collection('order_events').doc('latest').watch({
        onChange: () => {
          console.log('[Staff] order_events 变化，触发即时刷新');
          // 简单防抖：合并短时间内的连续事件
          if (this._orderRefreshDebounce) clearTimeout(this._orderRefreshDebounce);
          this._orderRefreshDebounce = setTimeout(() => this._loadInitialOrders(), 300);
        },
        onError: (err) => {
          console.warn('[Staff] order_events watch 出错，兜底轮询接管:', err);
          this._restartOrderWatcher();
        }
      });
    } catch (e) {
      console.warn('[Staff] 启动 watch 失败，兜底轮询接管:', e);
    }
  },

  // watch 断连后延迟重连
  _restartOrderWatcher() {
    if (this.orderWatcher) {
      try { this.orderWatcher.close(); } catch (e) {}
      this.orderWatcher = null;
    }
    if (this._watcherRestartTimer) clearTimeout(this._watcherRestartTimer);
    this._watcherRestartTimer = setTimeout(() => this._startOrderWatcher(), 5000);
  },

  // 将订单分类到不同列表
  _classifyOrders(orders) {
    console.log('[Staff] ========== _classifyOrders 开始 ==========');
    console.log('[Staff] 接收到的订单数量:', orders.length);
    console.log('[Staff] 订单列表:', orders.map(o => `${o.pickupNumber}(${o.status})`));

    const dineInOrders = [];
    const takeawayOrders = [];
    const completedOrders = [];

    orders.forEach(order => {
      const formattedOrder = this._formatOrder(order);

      if (order.status === 'done') {
        completedOrders.push(formattedOrder);
      } else if (['making', 'ready'].includes(order.status)) {
        // 制作中、待取餐的订单显示在新订单列表
        if (order.orderType === 'dine-in') {
          dineInOrders.push(formattedOrder);
        } else {
          takeawayOrders.push(formattedOrder);
        }
      }
    });

    // 已完成订单按完成时间倒序排列（最新的在最前面）
    completedOrders.sort((a, b) => {
      const timeA = new Date(a.completeTime || 0).getTime();
      const timeB = new Date(b.completeTime || 0).getTime();
      return timeB - timeA;
    });

    // 过滤只显示今天已完成的订单
    const todayCompletedOrders = completedOrders.filter(order => {
      const isToday = this._isTodayCompleted(order.completeTime);
      console.log('[Staff] 订单', order.pickupNumber, '完成时间:', order.completeTime, '是否今天:', isToday);
      return isToday;
    });

    console.log('[Staff] 分类后 - 堂食订单:', dineInOrders.map(o => `${o.pickupNumber}(${o._id.slice(-6)})`));
    console.log('[Staff] 分类后 - 外带订单:', takeawayOrders.map(o => `${o.pickupNumber}(${o._id.slice(-6)})`));
    console.log('[Staff] 分类后 - 已完成订单（全部）:', completedOrders.map(o => `${o.pickupNumber}(${o._id.slice(-6)})`));
    console.log('[Staff] 分类后 - 已完成订单（今天）:', todayCompletedOrders.map(o => `${o.pickupNumber}(${o._id.slice(-6)})`));

    this.setData({ dineInOrders, takeawayOrders, completedOrders: todayCompletedOrders });
    console.log('[Staff] ========== _classifyOrders 完成 ==========');
  },

  // 添加新订单
  _addNewOrder(order) {
    console.log('[Staff] ========== _addNewOrder 开始 ==========');
    console.log('[Staff] 订单ID:', order._id);
    console.log('[Staff] 订单状态:', order.status);
    console.log('[Staff] 订单类型:', order.orderType);
    console.log('[Staff] 取餐号:', order.pickupNumber);
    console.log('[Staff] 当前 dineInOrders:', this.data.dineInOrders.map(o => `${o.pickupNumber}(${o._id.slice(-6)})`));
    console.log('[Staff] 当前 takeawayOrders:', this.data.takeawayOrders.map(o => `${o.pickupNumber}(${o._id.slice(-6)})`));

    // 检查订单是否已存在
    const alreadyInDineIn = this.data.dineInOrders.find(o => o._id === order._id);
    const alreadyInTakeaway = this.data.takeawayOrders.find(o => o._id === order._id);
    const alreadyInCompleted = this.data.completedOrders.find(o => o._id === order._id);

    console.log('[Staff] 订单是否已在堂食列表:', !!alreadyInDineIn);
    console.log('[Staff] 订单是否已在外带列表:', !!alreadyInTakeaway);
    console.log('[Staff] 订单是否已在完成列表:', !!alreadyInCompleted);

    if (alreadyInDineIn || alreadyInTakeaway || alreadyInCompleted) {
      console.warn('[Staff] 订单已存在于列表中，跳过添加');
      return;
    }

    // 如果订单状态是已完成，添加到已完成列表
    if (order.status === 'done') {
      console.log('[Staff] 订单状态为 done，检查是否今天完成');
      const formatted = this._formatOrder(order);
      const isToday = this._isTodayCompleted(formatted.completeTime);
      console.log('[Staff] 订单', formatted.pickupNumber, '完成时间:', formatted.completeTime, '是否今天:', isToday);

      if (isToday) {
        this.setData({
          completedOrders: [formatted, ...this.data.completedOrders]  // 新订单在最前面
        });
        console.log('[Staff] 添加到已完成列表，当前数量:', this.data.completedOrders.length);
      } else {
        console.log('[Staff] 订单不是今天完成的，不添加到已完成列表');
      }
      return;
    }

    // 否则添加到新订单列表（新订单在最后）
    const formatted = this._formatOrder(order);
    if (order.orderType === 'dine-in') {
      console.log('[Staff] 添加到堂食列表');
      this.setData({
        dineInOrders: [...this.data.dineInOrders, formatted]
      });
      console.log('[Staff] 添加后 dineInOrders 数量:', this.data.dineInOrders.length);
    } else {
      console.log('[Staff] 添加到外带列表');
      this.setData({
        takeawayOrders: [...this.data.takeawayOrders, formatted]
      });
      console.log('[Staff] 添加后 takeawayOrders 数量:', this.data.takeawayOrders.length);
    }
    console.log('[Staff] ========== _addNewOrder 完成 ==========');
  },

  // 更新订单
  _updateOrder(order) {
    const formatted = this._formatOrder(order);
    
    if (order.orderType === 'dine-in') {
      const dineInOrders = this.data.dineInOrders.map(o => 
        o._id === order._id ? formatted : o
      );
      this.setData({ dineInOrders });
    } else {
      const takeawayOrders = this.data.takeawayOrders.map(o => 
        o._id === order._id ? formatted : o
      );
      this.setData({ takeawayOrders });
    }
  },

  // 将订单移到已完成
  _moveOrderToCompleted(orderId) {
    console.log('[Staff] ========== _moveOrderToCompleted 开始 ==========');
    console.log('[Staff] 订单ID:', orderId);
    console.log('[Staff] 当前 dineInOrders 数量:', this.data.dineInOrders.length);
    console.log('[Staff] 当前 takeawayOrders 数量:', this.data.takeawayOrders.length);
    console.log('[Staff] 当前 completedOrders 数量:', this.data.completedOrders.length);

    // 检查订单是否已在已完成列表，防止重复
    const alreadyInCompleted = this.data.completedOrders.find(o => o._id === orderId);
    if (alreadyInCompleted) {
      console.log('[Staff] 订单已在已完成列表中，跳过');
      return;
    }

    const dineInOrders = this.data.dineInOrders.filter(o => o._id !== orderId);
    const takeawayOrders = this.data.takeawayOrders.filter(o => o._id !== orderId);

    const order = [...this.data.dineInOrders, ...this.data.takeawayOrders]
      .find(o => o._id === orderId);

    console.log('[Staff] 找到的订单:', order ? order.pickupNumber : '未找到');

    if (order) {
      order.status = 'done';
      order.completeTime = new Date().toISOString();

      // 检查是否今天完成
      const isToday = this._isTodayCompleted(order.completeTime);
      console.log('[Staff] 订单', order.pickupNumber, '完成时间:', order.completeTime, '是否今天:', isToday);

      let completedOrders = [...this.data.completedOrders];
      if (isToday) {
        completedOrders = [order, ...completedOrders];  // 新完成的订单在最前面
      }

      console.log('[Staff] 更新后 dineInOrders 数量:', dineInOrders.length);
      console.log('[Staff] 更新后 takeawayOrders 数量:', takeawayOrders.length);
      console.log('[Staff] 更新后 completedOrders 数量:', completedOrders.length);
      console.log('[Staff] 准备执行 setData...');

      this.setData({
        dineInOrders,
        takeawayOrders,
        completedOrders
      }, () => {
        console.log('[Staff] setData 回调执行完成');
        console.log('[Staff] dineInOrders 数量:', this.data.dineInOrders.length);
        console.log('[Staff] takeawayOrders 数量:', this.data.takeawayOrders.length);
        console.log('[Staff] completedOrders 数量:', this.data.completedOrders.length);
        console.log('[Staff] ========== _moveOrderToCompleted 完成 ==========');
      });
    } else {
      console.warn('[Staff] 未找到订单，跳过移动');
    }
  },

  // 移除订单
  _removeOrder(orderId) {
    console.log('[Staff] ========== _removeOrder 开始 ==========');
    console.log('[Staff] 要移除的订单ID:', orderId);
    console.log('[Staff] 移除前 dineInOrders:', this.data.dineInOrders.map(o => `${o.pickupNumber}(${o._id.slice(-6)})`));
    console.log('[Staff] 移除前 takeawayOrders:', this.data.takeawayOrders.map(o => `${o.pickupNumber}(${o._id.slice(-6)})`));
    console.log('[Staff] 移除前 completedOrders:', this.data.completedOrders.map(o => `${o.pickupNumber}(${o._id.slice(-6)})`));

    const dineInOrders = this.data.dineInOrders.filter(o => o._id !== orderId);
    const takeawayOrders = this.data.takeawayOrders.filter(o => o._id !== orderId);
    const completedOrders = this.data.completedOrders.filter(o => o._id !== orderId);

    console.log('[Staff] 移除后 dineInOrders 数量:', dineInOrders.length);
    console.log('[Staff] 移除后 takeawayOrders 数量:', takeawayOrders.length);
    console.log('[Staff] 移除后 completedOrders 数量:', completedOrders.length);

    this.setData({ dineInOrders, takeawayOrders, completedOrders });
    console.log('[Staff] ========== _removeOrder 完成 ==========');
  },

  // 格式化订单数据
  _formatOrder(order) {
    const createTime = order.createTime || {};
    const timeStr = createTime.$date
      ? new Date(createTime.$date).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }).replace(/\//g, '-')
      : createTime
      ? new Date(createTime).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }).replace(/\//g, '-')
      : '';

    // 兼容 db.serverDate() 返回的 { $date: "..." } 格式
    const rawComplete = order.completeTime && order.completeTime.$date ? order.completeTime.$date : order.completeTime;
    const completeTimeStr = rawComplete
      ? new Date(rawComplete).toLocaleString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';

    const products = order.products || [];
    const items = products.map(p => {
      const d = formatScoopProduct(p);
      return {
        name: d.name || '',
        temperature: d.temperature || '',
        spec: d.spec || '',
        flavors: d.flavors || [],
        toppings: d.toppings || [],
        quantity: d.quantity || 1,
        price: d.price || 0,
        refunded: !!d.refunded
      };
    });
    const totalAmount = order.totalAmount || 0;
    const refundedAmount = refundedAmountOf(order); // 含旧整单退款 doc 级兜底
    const finalAmount = netAmountOf(order);

    return {
      _id: order._id,
      status: order.status || 'making',
      pickupNumber: order.pickupNumber || '',
      orderType: order.orderType || 'takeaway',
      time: timeStr,
      completeTime: rawComplete || '',   // _isTodayCompleted 使用
      completeTimeStr: completeTimeStr,
      items,
      totalAmount,
      refundedAmount,
      finalAmount,
      remark: order.remark || '',
      tableName: order.tableName || '',   // 桌面二维码桌位名
      orderId: order.orderId,
      outTradeNo: order.outTradeNo,
      transactionId: order.transactionId
    };
  },

  // 完成订单（无弹窗确认）
  onCompleteOrder(e) {
    console.log('[Staff] ========== 点击完成按钮 ==========');
    console.log('[Staff] 事件对象:', e);
    console.log('[Staff] currentTarget:', e.currentTarget);
    console.log('[Staff] dataset:', e.currentTarget.dataset);

    const orderId = e.currentTarget.dataset.id;
    const db = wx.cloud.database();

    console.log('[Staff] 完成订单，订单ID:', orderId);
    console.log('[Staff] 当前云环境:', wx.cloud.DYNAMIC_CURRENT_ENV || 'cloud3-d2gbcvyqkbc0fbf94');

    // 检查订单是否存在，并记录更新前状态（防重复通知）
    const allOrders = [...this.data.dineInOrders, ...this.data.takeawayOrders];
    const orderExists = allOrders.find(o => o._id === orderId);
    console.log('[Staff] 订单是否存在:', !!orderExists);
    if (!orderExists) {
      console.warn('[Staff] 订单不在列表中，可能已被处理');
      wx.showToast({ title: '订单已完成', icon: 'success', duration: 1000 });
      return;
    }
    const wasAlreadyDone = orderExists.status === 'done';

    wx.showLoading({ title: '处理中...', mask: true });

    // 状态变更改走云函数鉴权（客户端直写 orders 已被安全规则禁止 update=false）
    wx.cloud.callFunction({
      name: 'initDB',
      data: { action: 'updateOrderStatus', id: orderId, status: 'done' }
    }).then(callRes => {
      const r = callRes.result || {};
      if (!r.success) {
        throw new Error(r.message || '更新失败');
      }
      console.log('[Staff] 云函数更新订单状态成功');

      // 云函数已回读订单数据（客户端直读 orders 已被安全规则收紧）
      return r.order || {};
    }).then(orderData => {
      console.log('[Staff] ========== 验证订单状态 ==========');
      console.log('[Staff] 订单状态:', orderData.status);

      if (orderData.status === 'done') {
        console.log('[Staff] 订单状态已确认更新为 done');

        // ===== 发送取餐通知给顾客（仅首次完成时发送，防重复） =====
        if (wasAlreadyDone) {
          console.log('[Staff] 订单之前已完成，跳过通知');
          wx.hideLoading();
          return;
        }
        if (orderData.openid && orderData.pickupNumber) {
          // character_string1 仅支持字母数字，中文会被微信 API 拒绝
          console.log('[Staff] 发送取餐通知, openid:', orderData.openid, '取餐码:', orderData.pickupNumber);
          wx.cloud.callFunction({
            name: 'sendSubscribeMessage',
            data: {
              scene: 'pickup_notify',
              openid: orderData.openid,
              pickupNumber: orderData.pickupNumber,
              createTime: orderData.completeTime || orderData.createTime,  // 优先完成时间
            },
            success: (notifyRes) => {
              console.log('[Staff] 取餐通知发送结果:', JSON.stringify(notifyRes.result));
            },
            fail: (notifyErr) => {
              console.error('[Staff] 取餐通知发送失败（不影响完成操作）:', notifyErr);
            },
          });
        } else {
          console.warn('[Staff] 订单缺少 openid 或 pickupNumber，跳过通知');
        }

        // 使用 setTimeout 让本地状态有机会刷新
        setTimeout(() => {
          console.log('[Staff] 开始检查订单是否已移动');
          const stillInOrders = [...this.data.dineInOrders, ...this.data.takeawayOrders]
            .find(o => o._id === orderId);

          if (stillInOrders) {
            console.log('[Staff] 订单仍在制作列表，主动移动到已完成');
            this._moveOrderToCompleted(orderId);
          } else {
            console.log('[Staff] 订单已被轮询刷新移到已完成');
          }

          wx.hideLoading();
          wx.showToast({ title: '订单已完成', icon: 'success', duration: 1000 });
        }, 100);
      } else {
        console.error('[Staff] 订单状态未更新，当前状态:', orderData.status);
        throw new Error('订单状态验证失败');
      }
    }).catch(err => {
      console.error('[Staff] ========== 更新失败 ==========');
      console.error('[Staff] 错误信息:', err);
      console.error('[Staff] 错误代码:', err.errCode);
      console.error('[Staff] 错误描述:', err.errMsg);

      wx.hideLoading();

      // 根据错误信息显示不同的提示
      if (err.errCode === -502001 || err.message && err.message.includes('权限')) {
        wx.showToast({
          title: '权限不足，请等待规则生效',
          icon: 'none',
          duration: 3000
        });
      } else if (err.errCode === -504002) {
        wx.showToast({ title: '网络连接失败', icon: 'none', duration: 2000 });
      } else {
        wx.showToast({ title: '操作失败，请重试', icon: 'none', duration: 2000 });
      }

      // 恢复本地状态
      setTimeout(() => {
        console.log('[Staff] 恢复本地状态，重新加载订单');
        this._loadInitialOrders();
      }, 500);
    });
  },

  // ===== 退款（按商品分批） =====
  _refundSelectedAmount(candidates) {
    return candidates
      .filter(c => c.selected && !c.refunded)
      .reduce((s, c) => s + (Number(c.price) || 0), 0);
  },

  _setRefundCandidates(candidates) {
    const selectedAmount = this._refundSelectedAmount(candidates);
    this.setData({ refundModal: { ...this.data.refundModal, candidates, selectedAmount } });
  },

  onOpenRefund(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.completedOrders.find(o => o._id === id);
    if (!order) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      return;
    }
    if (!order.outTradeNo && !order.transactionId) {
      wx.showToast({ title: '缺少支付信息，无法退款', icon: 'none' });
      return;
    }

    const candidates = order.items.map((it, index) => ({
      index,
      name: it.name,
      spec: it.spec || '',
      flavors: it.flavors || [],
      toppings: it.toppings || [],
      price: it.price,
      refunded: it.refunded,
      selected: !it.refunded   // 默认全选所有未退商品
    }));

    this.setData({
      refundModal: {
        orderId: order._id,
        outTradeNo: order.outTradeNo,
        transactionId: order.transactionId,
        candidates,
        selectedAmount: this._refundSelectedAmount(candidates)
      }
    });
  },

  onToggleRefundItem(e) {
    const modal = this.data.refundModal;
    if (!modal) return;
    const index = Number(e.currentTarget.dataset.index);
    const candidates = modal.candidates.map((c, i) =>
      (i === index && !c.refunded) ? { ...c, selected: !c.selected } : c
    );
    this._setRefundCandidates(candidates);
  },

  onSelectAllRefund() {
    const modal = this.data.refundModal;
    if (!modal) return;
    const candidates = modal.candidates.map(c =>
      c.refunded ? { ...c, selected: false } : { ...c, selected: true }
    );
    this._setRefundCandidates(candidates);
  },

  onCloseRefund() {
    this.setData({ refundModal: null });
  },

  noop() {},

  async onConfirmRefund() {
    const modal = this.data.refundModal;
    if (!modal) return;
    const indexes = modal.candidates
      .filter(c => c.selected && !c.refunded)
      .map(c => c.index);
    if (indexes.length === 0) {
      wx.showToast({ title: '请选择要退款的商品', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '退款处理中...', mask: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'refundPayment',
        data: {
          orderId: modal.orderId,
          outTradeNo: modal.outTradeNo,
          transactionId: modal.transactionId,
          refundItems: indexes
        }
      });
      wx.hideLoading();
      const r = result.result || {};
      if (r.alreadyRefunded) {
        wx.showToast({ title: '所选商品已退款', icon: 'none' });
      } else if (r.isPartialRefund) {
        wx.showToast({ title: '部分退款成功', icon: 'success', duration: 2000 });
      } else {
        wx.showToast({ title: '退款成功', icon: 'success' });
      }
      this.setData({ refundModal: null });
      this._loadInitialOrders();
    } catch (e2) {
      wx.hideLoading();
      wx.showToast({ title: '退款失败，请重试', icon: 'none' });
      console.error('[Staff] 退款失败', e2);
    }
  },

  // 初始化/复用共享音频实例
  _ensureAudio() {
    if (!_audio) {
      _audio = wx.createInnerAudioContext();
      _audio.obeyMuteSwitch = false;   // iOS 无视物理静音键
      _audio.onError((e) => console.warn('[Staff] 音频播放出错', e));
    }
    return _audio;
  },

  // 解锁音频：首次用户交互时播放一次，之后才能自动播放提示音
  onUnlockAudio() {
    if (!_unlocked) {
      _unlocked = true;
      const audio = this._ensureAudio();
      audio.stop();
      audio.src = '/audio/03_ascending_chime.mp3';
      audio.play();
      console.log('[Staff] 音频已解锁，新订单提示音已开启');
    }
    this.setData({ soundEnabled: true });   // 无论是否已解锁，都隐藏开启横幅
  },

  // 播放新订单提示音
  _playNewOrderSound() {
    // 震动提示（不依赖用户交互，最可靠）
    wx.vibrateShort({ type: 'heavy' });

    // 音频提示需先完成解锁，否则会被平台静默拦截
    if (!_unlocked) {
      console.warn('[Staff] 音频未解锁，跳过提示音');
      return;
    }
    const audio = this._ensureAudio();
    audio.stop();                            // 停掉上一次，避免重叠
    audio.src = '/audio/新的订单查收_耳聆网_[声音ID：35825].mp3';
    audio.play();
    console.log('[Staff] 播放新订单提示音');
  },

  // 加载打烊状态
  async _loadShopStatus() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('homeSettings').doc('config').get();
      const data = res.data || {};
      const { openingTime, closingTime, manualClosed, manualClosedDate, manualClosedUntil } = data;
      let effective = manualClosed;
      const today = new Date().toISOString().slice(0, 10);
      if (manualClosed !== undefined && manualClosed !== null) {
        let expired = false;
        if (manualClosedUntil) expired = new Date() >= new Date(manualClosedUntil);
        else if (manualClosedDate && manualClosedDate < today && openingTime) {
          const h = new Date().getHours()*60+new Date().getMinutes();
          const o = parseInt(openingTime.split(':')[0])*60+parseInt(openingTime.split(':')[1]||0);
          expired = h >= o;
        }
        if (expired) effective = undefined;
      }
      if (effective === true) { this.setData({ shopClosed: true, manualClosed }); return; }
      if (effective === false) { this.setData({ shopClosed: false, manualClosed }); return; }
      if (!openingTime || !closingTime) { this.setData({ shopClosed: false }); return; }
      const now = new Date();
      const hm = now.getHours() * 60 + now.getMinutes();
      const open = parseInt(openingTime.split(':')[0]) * 60 + parseInt(openingTime.split(':')[1] || 0);
      const close = parseInt(closingTime.split(':')[0]) * 60 + parseInt(closingTime.split(':')[1] || 0);
      this.setData({ shopClosed: hm < open || hm >= close, manualClosed: !!manualClosed });
    } catch (e) { console.warn('[Staff] 加载打烊状态失败', e); }
  },

  // 切换打烊
  async onToggleClosed() {
    const newState = !this.data.shopClosed;
    this.setData({ shopClosed: newState, manualClosed: newState });
    try {
      await wx.cloud.callFunction({ name: 'initDB', data: { action: 'toggleClosed', manualClosed: newState } });
      // 成功后重新从数据库加载打烊状态，确保本地状态与数据库一致，
      // 同时消除 _loadShopStatus（onLoad 中异步调用）可能用旧值覆盖本次修改的竞态问题
      await this._loadShopStatus();
    } catch (e) {
      this.setData({ shopClosed: !newState, manualClosed: !newState });
    }
  },

  // 刷新页面（刷新订单 + 打烊状态；成功才提示）
  async onRefresh() {
    const ok = await this._loadInitialOrders();
    this._loadShopStatus();
    if (ok) {
      wx.showToast({ title: '已刷新', icon: 'success' });
    }
  },

  // 打开桌位管理页
  onOpenTableManage() {
    wx.navigateTo({ url: '/pages/staff/tableManage/tableManage' });
  },

  // 返回首页
  onBack() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  onUnload() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    if (this.orderWatcher) {
      try { this.orderWatcher.close(); } catch (e) {}
      this.orderWatcher = null;
    }
    if (this._watcherRestartTimer) clearTimeout(this._watcherRestartTimer);
    if (this._orderRefreshDebounce) clearTimeout(this._orderRefreshDebounce);
    // 停掉正在播放的提示音，但保留实例与解锁状态（模块级，便于下次进入复用）
    if (_audio) {
      _audio.stop();
    }
    this._removeHeartbeat();
  },

  // 获取今天0点的时间戳
  _getTodayStart() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  },

  // 检查订单是否是今天完成的
  _isTodayCompleted(completeTime) {
    if (!completeTime) return false;
    // 兼容 db.serverDate() 返回的 { $date: "..." } 格式
    const raw = completeTime.$date ? completeTime.$date : completeTime;
    const todayStart = this._getTodayStart();
    const orderCompleteTime = new Date(raw).getTime();
    return orderCompleteTime >= todayStart;
  },

  // 心跳：标记店员端在线
  async _heartbeat() {
    const openid = wx.getStorageSync('openid');
    if (!openid) return;
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      await db.collection('staff_heartbeat').doc(openid).set({
        data: { openid, lastSeen: new Date() }
      }).catch(async () => {
        await db.collection('staff_heartbeat').add({
          data: { _id: openid, openid, lastSeen: new Date() }
        });
      });
      console.log('[Staff] 心跳已上报');
    } catch (e) {
      console.warn('[Staff] 心跳上报失败', e);
    }
  },

  // 清除心跳：店员端关闭时移除标记
  async _removeHeartbeat() {
    const openid = wx.getStorageSync('openid');
    if (!openid) return;
    try {
      const db = wx.cloud.database();
      await db.collection('staff_heartbeat').doc(openid).remove();
      console.log('[Staff] 心跳已清除');
    } catch (e) {
      console.warn('[Staff] 心跳清除失败', e);
    }
  },

  // 处理屏幕尺寸变化（iPad 横屏/竖屏切换）
  onResize(res) {
    console.log('[Staff] ========== onResize 触发 ==========');
    console.log('[Staff] 屏幕尺寸变化:', res.size);
    console.log('[Staff] 窗口宽度:', res.size.windowWidth);
    console.log('[Staff] 窗口高度:', res.size.windowHeight);

    // 强制刷新界面，确保 scroll-view 正确渲染
    const { dineInOrders, takeawayOrders, completedOrders } = this.data;
    this.setData({
      dineInOrders: [],
      takeawayOrders: [],
      completedOrders: []
    }, () => {
      setTimeout(() => {
        this.setData({
          dineInOrders,
          takeawayOrders,
          completedOrders
        });
        console.log('[Staff] onResize 刷新完成');
      }, 50);
    });
  }
});
