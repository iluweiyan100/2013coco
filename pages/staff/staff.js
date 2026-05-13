// staff.js - 店员点单窗口
Page({
  data: {
    dineInOrders: [],      // 堂食订单
    takeawayOrders: [],    // 外带订单
    completedOrders: [],   // 已完成订单
    statusBarHeight: 0,    // 状态栏高度
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });

    // 打印当前环境信息
    console.log('[Staff] ========== 初始化信息 ==========');
    console.log('[Staff] 系统信息:', systemInfo);
    console.log('[Staff] 云环境 ID:', wx.cloud.DYNAMIC_CURRENT_ENV);

    // 获取当前用户信息
    const openid = wx.getStorageSync('openid');
    console.log('[Staff] 当前用户 openid:', openid);
    console.log('[Staff] globalData openid:', getApp().globalData.openid);

    this._loadInitialOrders();
    this._startWatching();

    // 启动定时轮询作为备用方案（每 30 秒）
    this.refreshTimer = setInterval(() => {
      console.log('[Staff] 定时刷新执行');
      this._loadInitialOrders();
    }, 30000);
  },

  // 初始加载：获取所有制作中、待取餐和已完成的订单
  async _loadInitialOrders() {
    const db = wx.cloud.database();
    const _ = db.command;

    try {
      const res = await db.collection('orders')
        .where({
          status: _.in(['making', 'ready', 'done'])
        })
        .orderBy('createTime', 'asc')  // 制作中、待取餐：最早的在最前面（下方）
        .limit(100)
        .get();

      this._classifyOrders(res.data);
    } catch (e) {
      console.error('[Staff] 加载初始订单失败', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 启动数据库实时监听
  _startWatching() {
    const db = wx.cloud.database();
    const _ = db.command;

    console.log('[Staff] 开始启动 watch 监听...');
    console.log('[Staff] 监听条件: status in [making, ready, done, pending]');

    this.orderWatcher = db.collection('orders')
      .where({
        status: _.in(['making', 'ready', 'done', 'pending'])
      })
      .watch({
        onChange: (snapshot) => {
          console.log('[Staff] ========== 订单变化触发 ==========');
          console.log('[Staff] docChanges 数量:', snapshot.docChanges.length);
          console.log('[Staff] docChanges 类型:', snapshot.docChanges.map(c => c.dataType));

          // 处理所有变化：新增、更新、删除
          snapshot.docChanges.forEach(change => {
            const doc = change.doc;
            const dataType = change.dataType; // 'init', 'add', 'update', 'remove'

            console.log('[Staff] --- 处理变化 ---');
            console.log('[Staff] 类型:', dataType);
            console.log('[Staff] 订单ID:', doc._id);
            console.log('[Staff] 订单状态:', doc.status);
            console.log('[Staff] 订单类型:', doc.orderType);
            console.log('[Staff] 取餐号:', doc.pickupNumber);

            switch(dataType) {
              case 'init':
                // 初始化数据已通过 _loadInitialOrders 处理
                console.log('[Staff] init 类型，跳过');
                break;

              case 'add':
                // 新订单：添加到对应区域
                console.log('[Staff] 新增订单，检查状态');
                console.log('[Staff] 当前 dineInOrders 数量:', this.data.dineInOrders.length);
                console.log('[Staff] 当前 takeawayOrders 数量:', this.data.takeawayOrders.length);

                // 只添加非 pending 状态的订单
                if (doc.status !== 'pending') {
                  console.log('[Staff] 订单状态为', doc.status, '，添加到列表');
                  this._addNewOrder(doc);
                  this._playNewOrderSound();
                  console.log('[Staff] 添加后 dineInOrders 数量:', this.data.dineInOrders.length);
                  console.log('[Staff] 添加后 takeawayOrders 数量:', this.data.takeawayOrders.length);
                } else {
                  console.log('[Staff] 订单状态为 pending，跳过显示');
                }
                break;

              case 'update':
                // 订单更新：可能是状态变化
                console.log('[Staff] ========== 订单更新 ==========');
                console.log('[Staff] 订单ID:', doc._id);
                console.log('[Staff] 订单状态:', doc.status);
                console.log('[Staff] 当前堂食列表:', this.data.dineInOrders.map(o => `${o.pickupNumber}(${o._id.slice(-6)})`));

                // 检查订单是否已经在显示列表中
                const inDineIn = this.data.dineInOrders.find(o => o._id === doc._id);
                const inTakeaway = this.data.takeawayOrders.find(o => o._id === doc._id);
                const inCompleted = this.data.completedOrders.find(o => o._id === doc._id);

                console.log('[Staff] 在堂食列表:', !!inDineIn);
                console.log('[Staff] 在外带列表:', !!inTakeaway);
                console.log('[Staff] 在已完成列表:', !!inCompleted);

                if (doc.status === 'done') {
                  // 移到已完成列表
                  console.log('[Staff] 状态为 done，调用 _moveOrderToCompleted');
                  this._moveOrderToCompleted(doc._id);
                } else if (['making', 'ready'].includes(doc.status)) {
                  // 如果订单之前在 pending 状态，现在变成 making/ready，需要添加到列表
                  if (!inDineIn && !inTakeaway && !inCompleted) {
                    console.log('[Staff] 订单从不在任何列表，添加到制作列表');
                    this._addNewOrder(doc);
                    this._playNewOrderSound();
                  } else {
                    // 更新新订单列表中的数据
                    console.log('[Staff] 订单已在列表中，更新数据');
                    this._updateOrder(doc);
                  }
                } else if (doc.status === 'pending') {
                  // 如果订单变回 pending（退款等情况），从显示列表中移除
                  console.log('[Staff] 状态为 pending，从列表中移除');
                  this._removeOrder(doc._id);
                }
                break;

              case 'remove':
                // 订单删除：从列表中移除
                console.log('[Staff] 订单删除，从列表中移除');
                this._removeOrder(doc._id);
                break;
            }
          });
          console.log('[Staff] ========== 变化处理完成 ==========');
        },
        onError: (err) => {
          console.error('[Staff] ========== 监听失败 ==========');
          console.error('[Staff] 错误信息:', err);
          wx.showToast({
            title: '监听失败，请刷新页面',
            icon: 'none',
            duration: 3000
          });
        }
      });
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
      order.completeTime = new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      });

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

    const completeTime = order.completeTime
      ? new Date(order.completeTime).toLocaleString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';

    return {
      _id: order._id,
      status: order.status || 'making',
      pickupNumber: order.pickupNumber || '',
      orderType: order.orderType || 'takeaway',
      time: timeStr,
      completeTime: completeTime,
      items: (order.products || []).map(p => ({
        name: p.name || '',
        temperature: p.temperature || '',
        quantity: p.quantity || 1,
        price: p.price || 0
      })),
      totalAmount: order.totalAmount || 0,
      remark: order.remark || ''
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

    // 检查订单是否存在
    const allOrders = [...this.data.dineInOrders, ...this.data.takeawayOrders];
    const orderExists = allOrders.find(o => o._id === orderId);
    console.log('[Staff] 订单是否存在:', !!orderExists);
    if (!orderExists) {
      console.warn('[Staff] 订单不在列表中，可能已被处理');
      wx.showToast({ title: '订单已完成', icon: 'success', duration: 1000 });
      return;
    }

    wx.showLoading({ title: '处理中...', mask: true });

    const updateData = {
      status: 'done',
      completeTime: db.serverDate()
    };

    console.log('[Staff] 准备更新数据:', updateData);

    db.collection('orders').doc(orderId).update({
      data: updateData
    }).then(res => {
      console.log('[Staff] ========== 数据库更新返回 ==========');
      console.log('[Staff] 更新结果:', res);
      console.log('[Staff] stats:', res.stats);
      console.log('[Staff] stats.updated:', res.stats.updated);
      console.log('[Staff] stats.removed:', res.stats.removed);

      // 检查是否真的更新成功
      if (res.stats && res.stats.updated > 0) {
        console.log('[Staff] 数据库记录已更新');

        // 验证数据库中的实际状态
        return db.collection('orders').doc(orderId).get();
      } else {
        console.error('[Staff] 数据库更新失败，stats.updated 为 0');
        console.error('[Staff] 可能原因：');
        console.error('[Staff] 1. 数据库权限不足（已修改安全规则，请稍后重试）');
        console.error('[Staff] 2. 订单已被其他设备完成');
        console.error('[Staff] 3. 订单不存在或已被删除');
        throw new Error('数据库更新失败，可能权限不足');
      }
    }).then(docRes => {
      console.log('[Staff] ========== 验证订单状态 ==========');
      console.log('[Staff] 订单文档:', docRes.data);
      console.log('[Staff] 订单状态:', docRes.data.status);

      if (docRes.data.status === 'done') {
        console.log('[Staff] 订单状态已确认更新为 done');

        // 使用 setTimeout 确保 watch 事件有时间触发
        setTimeout(() => {
          console.log('[Staff] 开始检查订单是否已移动');
          const stillInOrders = [...this.data.dineInOrders, ...this.data.takeawayOrders]
            .find(o => o._id === orderId);

          if (stillInOrders) {
            console.log('[Staff] 订单仍在制作列表，主动移动到已完成');
            this._moveOrderToCompleted(orderId);
          } else {
            console.log('[Staff] 订单已被 watch 事件移到已完成');
          }

          wx.hideLoading();
          wx.showToast({ title: '订单已完成', icon: 'success', duration: 1000 });
        }, 100);
      } else {
        console.error('[Staff] 订单状态未更新，当前状态:', docRes.data.status);
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

  // 播放新订单提示音
  _playNewOrderSound() {
    const audio = wx.createInnerAudioContext();
    audio.src = '/audio/new-order.mp3';
    audio.onError(() => {
      console.warn('[Staff] 提示音播放失败');
    });
    audio.play();
  },

  // 刷新页面
  onRefresh() {
    this._loadInitialOrders();
    wx.showToast({ title: '已刷新', icon: 'success' });
  },

  // 返回首页
  onBack() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  onUnload() {
    if (this.orderWatcher) {
      this.orderWatcher.close();
    }
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
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
    const todayStart = this._getTodayStart();
    const orderCompleteTime = new Date(completeTime).getTime();
    return orderCompleteTime >= todayStart;
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
