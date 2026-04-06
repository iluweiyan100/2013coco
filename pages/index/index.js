// index.js
Page({
  data: {
    currentTab: 'home'
  },

  onLoad() {
    // 页面加载时获取用户信息
    this.getUserInfo();
  },

  // 获取用户信息
  getUserInfo() {
    wx.cloud.callFunction({
      name: 'getOpenId',
      success: res => {
        console.log('用户 OpenID:', res.result.openid);
        this.globalData = {
          openid: res.result.openid
        };
      },
      fail: err => {
        console.error('获取用户信息失败:', err);
      }
    });
  },

  // 堂食点击
  onDineInTap() {
    console.log('选择堂食');
    wx.navigateTo({
      url: '/pages/menu/menu?type=dine-in'
    });
  },

  // 外带点击
  onTakeawayTap() {
    console.log('选择外带');
    wx.navigateTo({
      url: '/pages/menu/menu?type=takeaway'
    });
  },

  // 连接 WiFi
  onConnectWifi() {
    console.log('连接 WiFi');
    wx.startWifi({
      success: () => {
        wx.connectWifi({
          SSID: 'Coco_Cafe_WiFi',
          password: '',
          success: () => {
            wx.showToast({
              title: 'WiFi 连接成功',
              icon: 'success'
            });
          },
          fail: () => {
            wx.showToast({
              title: 'WiFi 连接失败',
              icon: 'none'
            });
          }
        });
      },
      fail: () => {
        wx.showToast({
          title: '请先开启 WiFi',
          icon: 'none'
        });
      }
    });
  },

  // 店员制作端
  onStaffMode() {
    console.log('进入店员制作端');
    wx.navigateTo({
      url: '/pages/staff/staff'
    });
  },

  // 管理后台
  onAdminMode() {
    console.log('进入管理后台');
    wx.navigateTo({
      url: '/pages/admin/admin'
    });
  },

  // Tab 切换
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    console.log('切换到:', tab);
    
    this.setData({
      currentTab: tab
    });

    // 根据 tab 跳转到对应页面
    const pages = {
      'home': '/pages/index/index',
      'order': '/pages/order/order',
      'orders': '/pages/orders/orders',
      'profile': '/pages/profile/profile'
    };

    if (tab === 'home') {
      // 当前页面，不做处理
      return;
    } else if (pages[tab]) {
      // 使用 navigateTo 跳转到目标页面
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
  }
});
