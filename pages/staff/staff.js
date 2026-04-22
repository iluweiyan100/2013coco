// staff.js - 店员点单窗口
Page({
  data: {
    dineInOrders: [],      // 堂食订单
    takeawayOrders: [],    // 外带订单
    completedOrders: [],   // 已完成订单
  },

  onLoad() {
    this._loadInitialOrders();
    this._startWatching();
  },

  // 初始加载：获取所有制作中和已完成的订单
  async _loadInitialOrders() {
    const db = wx.cloud.database();
    const _ = db.command;
    
    try {
      const res = await db.collection('orders')
        .where({
          status: _.in(['making', 'done'])
        })
        .orderBy('createTime', 'desc')
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
    
    this.orderWatcher = db.collection('orders')
      .where({ status: 'making' })
      .watch({
        onChange: (snapshot) => {
          console.log('[Staff] 订单变化', snapshot);
          
          // 处理所有变化：新增、更新、删除
          snapshot.docChanges.forEach(change => {
            const doc = change.doc;
            const dataType = change.dataType; // 'init', 'add', 'update', 'remove'
            
            switch(dataType) {
              case 'init':
                // 初始化数据已通过 _loadInitialOrders 处理
                break;
              
              case 'add':
                // 新订单：添加到对应区域
                this._addNewOrder(doc);
                this._playNewOrderSound();
                break;
              
              case 'update':
                // 订单更新：可能是状态变化
                if (doc.status === 'done') {
                  // 移到已完成列表
                  this._moveOrderToCompleted(doc._id);
                } else if (doc.status === 'making') {
                  // 更新新订单列表中的数据
                  this._updateOrder(doc);
                }
                break;
              
              case 'remove':
                // 订单删除：从列表中移除
                this._removeOrder(doc._id);
                break;
            }
          });
        },
        onError: (err) => {
          console.error('[Staff] 监听失败', err);
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
    const dineInOrders = [];
    const takeawayOrders = [];
    const completedOrders = [];
    
    orders.forEach(order => {
      const formattedOrder = this._formatOrder(order);
      
      if (order.status === 'done') {
        completedOrders.push(formattedOrder);
      } else if (order.orderType === 'dine-in') {
        dineInOrders.push(formattedOrder);
      } else {
        takeawayOrders.push(formattedOrder);
      }
    });
    
    this.setData({ dineInOrders, takeawayOrders, completedOrders });
  },

  // 添加新订单
  _addNewOrder(order) {
    const formatted = this._formatOrder(order);
    
    if (order.orderType === 'dine-in') {
      this.setData({
        dineInOrders: [formatted, ...this.data.dineInOrders]
      });
    } else {
      this.setData({
        takeawayOrders: [formatted, ...this.data.takeawayOrders]
      });
    }
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
    const dineInOrders = this.data.dineInOrders.filter(o => o._id !== orderId);
    const takeawayOrders = this.data.takeawayOrders.filter(o => o._id !== orderId);
    
    const order = [...this.data.dineInOrders, ...this.data.takeawayOrders]
      .find(o => o._id === orderId);
    
    if (order) {
      order.status = 'done';
      order.completeTime = new Date();
      const completedOrders = [order, ...this.data.completedOrders];
      
      this.setData({
        dineInOrders,
        takeawayOrders,
        completedOrders
      });
    }
  },

  // 移除订单
  _removeOrder(orderId) {
    const dineInOrders = this.data.dineInOrders.filter(o => o._id !== orderId);
    const takeawayOrders = this.data.takeawayOrders.filter(o => o._id !== orderId);
    const completedOrders = this.data.completedOrders.filter(o => o._id !== orderId);
    
    this.setData({ dineInOrders, takeawayOrders, completedOrders });
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
      : '';
    
    const completeTime = order.completeTime ? new Date(order.completeTime).toLocaleString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    }) : '';

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
    const orderId = e.currentTarget.dataset.id;
    const db = wx.cloud.database();
    
    db.collection('orders').doc(orderId).update({
      data: { 
        status: 'done',
        completeTime: db.serverDate()
      }
    }).then(() => {
      // watch 会自动检测到变化，调用 _moveOrderToCompleted
      wx.showToast({ title: '订单已完成', icon: 'success', duration: 1000 });
    }).catch(err => {
      console.error('[Staff] 更新失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
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

  onUnload() {
    if (this.orderWatcher) {
      this.orderWatcher.close();
    }
  }
});
