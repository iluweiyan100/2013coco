// pages/orders/orders.js
Page({
  data: {
    currentTab: 'all',
    filteredOrders: [],
    orders: [],
    currentOrder: null,
    openid: ''
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });
    this.loadOrders();
  },

  onShow() {
    this.loadOrders();
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
      .orderBy('createTime', 'desc')
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

    let status = 'pending';
    let statusText = '待取餐';
    let statusIcon = '2';

    if (order.status === 'pending') {
      status = 'pending';
      statusText = '待支付';
      statusIcon = '1';
    } else if (order.status === 'making') {
      status = 'making';
      statusText = '制作中';
      statusIcon = '1';
    } else if (order.status === 'ready') {
      status = 'ready';
      statusText = '待取餐';
      statusIcon = '2';
    } else if (order.status === 'done') {
      status = 'completed';
      statusText = '已完成';
      statusIcon = 'check';
    } else if (order.status === 'refunded') {
      status = 'refunded';
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
    } else if (currentTab === 'pending') {
      filtered = orders.filter(order => ['making', 'ready', 'pending'].includes(order.status));
    } else if (currentTab === 'completed') {
      filtered = orders.filter(order => ['done', 'refunded'].includes(order.status));
    }

    console.log('[updateFilteredOrders] filteredOrders 数量:', filtered.length);
    this.setData({
      filteredOrders: filtered
    });
  }
});
