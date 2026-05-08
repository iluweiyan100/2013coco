// pages/orders/orders.js
Page({
  data: {
    currentTab: 'all',
    filteredOrders: [],
    orders: [],
    currentOrder: null,
    openid: '',
    ordersWatcher: null  // 数据库监听器
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });
    this.loadOrders();
    this._startWatchingOrders();

    // 启动定时轮询作为备用方案（每 30 秒）
    this.refreshTimer = setInterval(() => {
      console.log('[Orders] 定时刷新执行');
      this.loadOrders();
    }, 30000);
  },

  onShow() {
    // 页面显示时只更新当前订单，不重新加载所有订单
    // 重新加载会由 watch 监听自动处理
    this.updateCurrentOrder();
  },

  // 下拉刷新
  onPullDownRefresh() {
    console.log('[Orders] 下拉刷新');
    this.loadOrders();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  },

  // 从数据库加载订单
  loadOrders() {
    let openid = wx.getStorageSync('openid');
    if (!openid) {
      const app = getApp();
      if (app.globalData.openid) {
        openid = app.globalData.openid;
        wx.setStorageSync('openid', openid);
      } else {
        this.setData({
          orders: [],
          filteredOrders: []
        });
        return;
      }
    }
    console.log('[LoadOrders] openid:', openid);

    this.setData({
      openid: openid
    });

    const db = wx.cloud.database();
    db.collection('orders')
      .where({
        openid: openid
      })
      .orderBy('createTime', 'asc')  // 改为升序，最早的在前，新订单在末尾
      .get({
        success: (res) => {
          console.log('[LoadOrders] 查询结果数量:', res.data.length);
          console.log('[LoadOrders] 原始订单数据:', res.data);
          const orders = res.data.map(order => this.formatOrder(order));
          console.log('[LoadOrders] 格式化后订单数据:', orders);
          this.setData({
            orders: orders
          }, () => {
            console.log('[LoadOrders] setData 完成，当前 orders:', this.data.orders);
            this.updateFilteredOrders();
            this.updateCurrentOrder();
          });
        },
        fail: (err) => {
          console.error('获取订单失败:', err);
          wx.showToast({
            title: '获取订单失败',
            icon: 'none'
          });
        }
      });
  },

  // 格式化订单数据
  formatOrder(order) {
    const createTime = new Date(order.createTime);
    const month = (createTime.getMonth() + 1).toString().padStart(2, '0');
    const day = createTime.getDate().toString().padStart(2, '0');
    const hour = createTime.getHours().toString().padStart(2, '0');
    const minute = createTime.getMinutes().toString().padStart(2, '0');

    let status = order.status || 'pending';
    let statusText = '待取餐';
    let statusIcon = '2';

    if (status === 'pending') {
      statusText = '待支付';
      statusIcon = '1';
    } else if (status === 'making') {
      statusText = '制作中';
      statusIcon = '1';
    } else if (status === 'ready') {
      statusText = '待取餐';
      statusIcon = '2';
    } else if (status === 'done') {
      statusText = '已完成';
      statusIcon = 'check';
    } else if (status === 'refunded') {
      statusText = '已退款';
      statusIcon = 'close';
    }

    return {
      id: order._id,
      pickupNumber: order.pickupNumber || '',
      date: `${month}-${day}`,
      time: `${hour}:${minute}`,
      orderType: order.orderType === 'dine-in' ? '堂食' : '外带',
      status: status,
      statusText: statusText,
      statusIcon: statusIcon,
      products: order.products || [],
      totalAmount: order.totalAmount || 0,
      createTime: order.createTime
    };
  },

  // 更新当前正在进行的订单
  updateCurrentOrder() {
    const { orders } = this.data;
    const currentOrder = orders.find(order => order.status === 'making' || order.status === 'pending');

    console.log('[updateCurrentOrder] currentOrder:', currentOrder);

    if (currentOrder) {
      this.setData({
        currentOrder: currentOrder
      });
    } else {
      this.setData({
        currentOrder: null
      });
    }
  },

  // Tab 切换
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      currentTab: tab
    });
    this.updateFilteredOrders();
  },

  // 根据当前 Tab 过滤订单
  updateFilteredOrders() {
    const { currentTab, orders } = this.data;
    console.log('[updateFilteredOrders] currentTab:', currentTab);
    console.log('[updateFilteredOrders] orders 数量:', orders.length);
    let filtered = [];

    if (currentTab === 'all') {
      filtered = orders;
    } else if (currentTab === 'making') {
      // 制作中：包含 making、ready 状态
      filtered = orders.filter(order => ['making', 'ready'].includes(order.status));
    } else if (currentTab === 'completed') {
      // 已完成：包含 done、refunded 状态
      filtered = orders.filter(order => ['done', 'refunded'].includes(order.status));
    }

    console.log('[updateFilteredOrders] filteredOrders 数量:', filtered.length);
    this.setData({
      filteredOrders: filtered
    });
  },

  // ========== 数据库实时监听 ==========

  // 启动订单监听
  _startWatchingOrders() {
    let openid = wx.getStorageSync('openid');
    if (!openid) {
      const app = getApp();
      if (app.globalData.openid) {
        openid = app.globalData.openid;
        wx.setStorageSync('openid', openid);
      } else {
        console.log('[Orders] openid 不存在，无法启动监听');
        return;
      }
    }

    console.log('[Orders] ========== 启动 watch 监听 ==========');
    console.log('[Orders] openid:', openid);
    console.log('[Orders] 监听条件: openid =', openid);

    const db = wx.cloud.database();
    const _ = db.command;

    this.ordersWatcher = db.collection('orders')
      .where({
        openid: openid
      })
      .watch({
        onChange: (snapshot) => {
          console.log('[Orders] ========== 订单变化触发 ==========');
          console.log('[Orders] docChanges 数量:', snapshot.docChanges.length);
          console.log('[Orders] docChanges 类型:', snapshot.docChanges.map(c => c.dataType));

          // 处理所有变化：新增、更新、删除
          snapshot.docChanges.forEach(change => {
            const doc = change.doc;
            const dataType = change.dataType; // 'init', 'add', 'update', 'remove'

            console.log('[Orders] --- 处理变化 ---');
            console.log('[Orders] 类型:', dataType);
            console.log('[Orders] 订单ID:', doc._id);
            console.log('[Orders] 订单状态:', doc.status);
            console.log('[Orders] 订单类型:', doc.orderType);
            console.log('[Orders] 取餐号:', doc.pickupNumber);

            switch(dataType) {
              case 'init':
                // 初始化数据已通过 loadOrders 处理
                console.log('[Orders] init 类型，跳过');
                break;

              case 'add':
                // 新订单：添加到列表
                console.log('[Orders] 新增订单');
                this._addSingleOrder(doc);
                break;

              case 'update':
                // 订单更新：可能是状态变化
                console.log('[Orders] 订单更新');
                this._updateSingleOrder(doc);
                break;

              case 'remove':
                // 订单删除：从列表中移除
                console.log('[Orders] 订单删除');
                this._removeOrderById(doc._id);
                break;
            }
          });
          console.log('[Orders] ========== 变化处理完成 ==========');
        },
        onError: (err) => {
          console.error('[Orders] ========== 监听失败 ==========');
          console.error('[Orders] 错误信息:', err);
          wx.showToast({
            title: '监听失败，已重新加载',
            icon: 'none',
            duration: 2000
          });
          setTimeout(() => {
            this.loadOrders();
          }, 1000);
        }
      });
  },

  // 添加单个订单
  _addSingleOrder(orderDoc) {
    console.log('[Orders] _addSingleOrder 开始');
    console.log('[Orders] 订单状态:', orderDoc.status);
    console.log('[Orders] 当前 orders 数量:', this.data.orders.length);

    // 过滤 pending 状态的订单，不显示在用户端
    if (orderDoc.status === 'pending') {
      console.log('[Orders] 订单状态为 pending，跳过添加');
      return;
    }

    const formattedOrder = this.formatOrder(orderDoc);
    const orders = this.data.orders || [];

    // 检查是否已存在（防止重复添加）
    const exists = orders.find(o => o.id === orderDoc._id);
    if (exists) {
      console.log('[Orders] 订单已存在，跳过添加');
      return;
    }

    // 添加到列表末尾
    orders.push(formattedOrder);
    console.log('[Orders] 添加订单后总数:', orders.length);

    this.setData({
      orders: orders
    }, () => {
      this.updateFilteredOrders();
      this.updateCurrentOrder();
    });
  },

  // 更新单个订单
  _updateSingleOrder(orderDoc) {
    console.log('[Orders] _updateSingleOrder 开始');
    console.log('[Orders] 订单状态:', orderDoc.status);
    console.log('[Orders] 当前 orders 数量:', this.data.orders.length);

    // 过滤 pending 状态的订单，不显示在用户端
    if (orderDoc.status === 'pending') {
      console.log('[Orders] 订单状态为 pending，跳过更新');
      // 如果订单之前在列表中，现在变回 pending，需要移除
      const orders = this.data.orders.filter(o => o.id !== orderDoc._id);
      this.setData({
        orders: orders
      }, () => {
        this.updateFilteredOrders();
        this.updateCurrentOrder();
      });
      return;
    }

    const formattedOrder = this.formatOrder(orderDoc);
    const orders = this.data.orders || [];

    // 查找订单索引
    const index = orders.findIndex(o => o.id === orderDoc._id);

    if (index >= 0) {
      // 更新现有订单
      const oldStatus = orders[index].status;
      const newStatus = formattedOrder.status;

      orders[index] = formattedOrder;
      console.log('[Orders] 更新订单:', orderDoc._id, '状态:', oldStatus, '→', newStatus);

      // 如果状态从 making/ready 变为 done，且当前在"制作中"选项，提示用户
      if ((oldStatus === 'making' || oldStatus === 'ready') && newStatus === 'done') {
        console.log('[Orders] 订单已完成，检查当前 Tab');
        const { currentTab } = this.data;
        if (currentTab === 'making') {
          wx.showToast({
            title: '订单已完成',
            icon: 'success',
            duration: 1500
          });
        }
      }

      this.setData({
        orders: orders
      }, () => {
        this.updateFilteredOrders();
        this.updateCurrentOrder();
      });
    } else {
      // 订单不存在，添加到列表
      console.log('[Orders] 订单不存在，作为新订单添加');
      this._addSingleOrder(orderDoc);
    }
  },

  // 移除订单
  _removeOrderById(orderId) {
    console.log('[Orders] _removeOrderById, 订单ID:', orderId);
    const orders = this.data.orders.filter(o => o.id !== orderId);

    this.setData({
      orders: orders
    }, () => {
      this.updateFilteredOrders();
      this.updateCurrentOrder();
    });
  },

  // 页面卸载时关闭监听
  onUnload() {
    console.log('[Orders] 页面卸载，关闭 watch 监听');
    if (this.ordersWatcher) {
      this.ordersWatcher.close();
    }
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }
});
