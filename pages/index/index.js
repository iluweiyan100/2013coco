// index.js
Page({
  data: {
    heroImages: []
  },

  onLoad() {
    this.getUserInfo();
    this._loadHeroImages();
  },

  onShow() {
    // 已有图片时不重复加载（避免每次切换回首页都刷新轮播）
    if (this.data.heroImages.length === 0) {
      this._loadHeroImages();
    }
  },

  async _loadHeroImages() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('heroImages').doc('config').get();
      const fileIDs = (res.data && res.data.images) || [];
      if (fileIDs.length === 0) {
        this.setData({ heroImages: [] });
        return;
      }
      const urlRes = await wx.cloud.getTempFileURL({ fileList: fileIDs });
      const urls = urlRes.fileList.map(f => f.tempFileURL);
      this.setData({ heroImages: urls });
    } catch (e) {
      // 加载失败时保留现有图片，不清空
      console.warn('[Index] 加载轮播图失败', e);
    }
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
  }
});
