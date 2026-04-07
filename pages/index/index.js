// index.js
Page({
  data: {
    cartCount: 3  // 示例数量，实际可从购物车存储中读取
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
    let ssid = 'CoffeeShop_Guest';
    let password = 'StoreWifi2024';
    try {
      const saved = wx.getStorageSync('homeSettings');
      if (saved && saved.wifiName) {
        ssid = saved.wifiName;
        password = saved.wifiPassword || '';
      }
    } catch (e) {}

    wx.startWifi({
      success: () => {
        wx.connectWifi({
          SSID: ssid,
          password: password,
          success: () => {
            wx.showToast({ title: 'WiFi 连接成功', icon: 'success' });
          },
          fail: () => {
            wx.showToast({ title: 'WiFi 连接失败', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '请先开启 WiFi', icon: 'none' });
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

  // 购物车
  onCartTap() {
    wx.navigateTo({
      url: '/pages/order/order'
    });
  }
});
