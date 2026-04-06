// pages/orders/orders.js
Page({
  data: {
    currentTab: 'all', // all, pending, completed（订单列表的 Tab）
    filteredOrders: [], // 过滤后的订单列表
    orders: [
      {
        id: 1,
        pickupNumber: 'A05',
        date: '04-03',
        time: '17:31',
        orderType: '堂食',
        status: 'making',
        statusText: '制作中',
        statusIcon: 'clock',
        products: [
          { name: '经典热可可', option: '热', quantity: 1, price: 28 },
          { name: '拿铁咖啡', option: '冷', quantity: 2, price: 60 }
        ],
        totalAmount: 88
      },
      {
        id: 2,
        pickupNumber: 'B12',
        date: '04-03',
        time: '17:34',
        orderType: '外带',
        status: 'pending',
        statusText: '待取餐',
        statusIcon: 'bag',
        products: [
          { name: '巧克力冰淇淋', quantity: 2, price: 50 }
        ],
        totalAmount: 50
      }
    ]
  },

  onLoad(options) {
    // 页面加载时初始化过滤订单
    this.updateFilteredOrders();
  },

  // 订单列表 Tab 切换（全部/待使用/已完成）
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      currentTab: tab
    });
    // 更新过滤后的订单
    this.updateFilteredOrders();
  },

  // 根据当前 Tab 过滤订单
  updateFilteredOrders() {
    const { currentTab, orders } = this.data;
    let filtered = [];
    
    if (currentTab === 'all') {
      filtered = orders;
    } else if (currentTab === 'pending') {
      filtered = orders.filter(order => order.status === 'making' || order.status === 'pending');
    } else if (currentTab === 'completed') {
      filtered = orders.filter(order => order.status === 'completed');
    }
    
    this.setData({
      filteredOrders: filtered
    });
  },

  // 底部 TabBar 切换
  onBottomTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    
    // 如果点击的是当前页面，不做处理
    if (tab === 'orders') {
      return;
    }

    // 页面映射
    const pages = {
      'home': '/pages/index/index',
      'order': '/pages/order/order',
      'profile': '/pages/profile/profile'
    };

    // 跳转到对应页面
    if (pages[tab]) {
      wx.navigateTo({
        url: pages[tab],
        fail: (err) => {
          console.error('跳转失败:', err);
          wx.showToast({
            title: '页面加载失败',
            icon: 'none'
          });
        }
      });
    }
  },

  onShow() {
    // 页面显示时更新过滤后的订单
    this.updateFilteredOrders();
  }
});
