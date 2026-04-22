// pages/orders/orders.js
Page({
  data: {
    currentTab: 'all',
    filteredOrders: [],
    orders: [],
    currentOrder: null, // 当前正在进行的订单
    openid: ''
  },

  onLoad(options) {
    this.loadOrders();
  },

  onShow() {
    this.loadOrders();
  },

  // 从数据库加载订单
  loadOrders() {
    const openid = wx.getStorageSync('openid');
    if (!openid) {
      this.setData({
        orders: [],
        filteredOrders: []
      });
      return;
    }

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
          const orders = res.data.map(order => this.formatOrder(order));
          this.setData({
            orders: orders
          });
          this.updateFilteredOrders();
          this.updateCurrentOrder();
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
    let statusIcon = 'bag';

    if (order.status === 'pending') {
      status = 'pending';
      statusText = '待支付';
      statusIcon = 'clock';
    } else if (order.status === 'making') {
      status = 'making';
      statusText = '制作中';
      statusIcon = 'clock';
    } else if (order.status === 'ready') {
      status = 'ready';
      statusText = '待取餐';
      statusIcon = 'bag';
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
    let filtered = [];

    if (currentTab === 'all') {
      filtered = orders;
    } else if (currentTab === 'pending') {
      filtered = orders.filter(order => ['making', 'ready', 'pending'].includes(order.status));
    } else if (currentTab === 'completed') {
      filtered = orders.filter(order => ['done', 'refunded'].includes(order.status));
    }

    this.setData({
      filteredOrders: filtered
    });
  }
});
