// index.js
Page({
  data: {
    statusBarHeight: 0,
    heroImages: [],
    shareConfig: {},  // 分享配置
    takeawayClickCount: 0,  // 外带点击计数
    takeawayClickTimer: null  // 外带点击计时器
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });
    this._loadHeroImages();
    this._loadShareConfig();
  },

  onShow() {
    // 已有图片时不重复加载（避免每次切换回首页都刷新轮播）
    if (this.data.heroImages.length === 0) {
      this._loadHeroImages();
    }
  },

  // 加载分享配置
  async _loadShareConfig() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('share_config').doc('index_share').get();
      if (res.data) {
        this.setData({ shareConfig: res.data });
        console.log('[Index] 加载分享配置成功', res.data);
      }
    } catch (e) {
      console.log('[Index] 加载分享配置失败，使用默认配置');
    }
  },

  async _loadHeroImages() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('heroImages').doc('config').get();
      const images = (res.data && res.data.images) || [];
      if (images.length === 0) {
        this.setData({ heroImages: [] });
        return;
      }
      // 提取 fileID 字符串列表
      const fileList = images.map(img => img.fileID || img).filter(Boolean);
      const urlRes = await wx.cloud.getTempFileURL({ fileList });
      const urls = urlRes.fileList.map(f => f.tempFileURL);
      this.setData({ heroImages: urls });
    } catch (e) {
      // 加载失败时保留现有图片，不清空
      console.warn('[Index] 加载轮播图失败', e);
    }
  },



  // 堂食点击
  onDineInTap() {
    console.log('选择堂食');
    wx.reLaunch({
      url: '/pages/order/order?type=dine-in'
    });
  },

  // 堂食长按3秒进入店员制作端
  onDineInLongPress() {
    console.log('堂食长按3秒，验证店员身份');
    
    wx.showLoading({ title: '验证中...' });
    
    wx.cloud.callFunction({
      name: 'verifyStaffAuth',
      success: (res) => {
        wx.hideLoading();
        if (res.result.success && res.result.authorized) {
          wx.vibrateShort({ type: 'heavy' });
          wx.showToast({ 
            title: `欢迎 ${res.result.data.name}`,
            icon: 'success' 
          });
          setTimeout(() => {
            wx.navigateTo({ url: '/pages/staff/staff' });
          }, 1500);
        } else {
          wx.showToast({ 
            title: '无权访问店员端', 
            icon: 'none' 
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('验证失败:', err);
        wx.showToast({ 
          title: '验证失败', 
          icon: 'none' 
        });
      }
    });
  },

  // 外带点击
  onTakeawayTap() {
    console.log('选择外带');

    // 点击计数
    this.data.takeawayClickCount++;

    // 清除之前的计时器
    if (this.data.takeawayClickTimer) {
      clearTimeout(this.data.takeawayClickTimer);
    }

    // 如果连续点击3次
    if (this.data.takeawayClickCount >= 3) {
      console.log('外带三连击，验证管理员身份');
      
      // 取消计时器
      if (this.data.takeawayClickTimer) {
        clearTimeout(this.data.takeawayClickTimer);
        this.data.takeawayClickTimer = null;
      }
      
      wx.showLoading({ title: '验证中...' });
      
      wx.cloud.callFunction({
        name: 'verifyAdminAuth',
        success: (res) => {
          wx.hideLoading();
          if (res.result.success && res.result.authorized) {
            wx.vibrateShort({ type: 'heavy' });
            wx.showToast({ 
              title: `欢迎 ${res.result.data.name}`,
              icon: 'success' 
            });
            setTimeout(() => {
              wx.navigateTo({ url: '/pages/admin/admin' });
            }, 1500);
          } else {
            wx.showToast({ 
              title: '无权访问管理后台', 
              icon: 'none' 
            });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          console.error('验证失败:', err);
          wx.showToast({ 
            title: '验证失败', 
            icon: 'none' 
          });
        }
      });
      
      // 重置计数
      this.setData({ takeawayClickCount: 0 });
      return;
    }

    // 设置新的计时器，500ms后重置计数
    this.data.takeawayClickTimer = setTimeout(() => {
      this.setData({ takeawayClickCount: 0 });
      // 执行正常的外带跳转
      wx.reLaunch({
        url: '/pages/order/order?type=takeaway'
      });
    }, 500);
  },

  // 连接 WiFi
  onConnectWifi() {
    console.log('[WiFi] 点击连接按钮');

    let ssid = '';
    let password = '';

    // 从云数据库获取最新 Wi-Fi 设置
    wx.cloud.database().collection('homeSettings').doc('config').get({
      success: (res) => {
        console.log('[WiFi] 云数据库读取成功:', res.data);
        if (res.data && res.data.wifiName) {
          ssid = res.data.wifiName;
          password = res.data.wifiPassword || '';
          console.log('[WiFi] 获取到 Wi-Fi 配置:', ssid);
        } else {
          console.log('[WiFi] 云数据库中无 Wi-Fi 配置');
          wx.showToast({ title: '暂无 Wi-Fi 配置', icon: 'none' });
          return;
        }
        this._connectWifi(ssid, password);
      },
      fail: (err) => {
        console.error('[WiFi] 云数据库读取失败:', err);
        // 如果云数据库读取失败，尝试从本地存储读取
        try {
          const saved = wx.getStorageSync('homeSettings');
          console.log('[WiFi] 本地存储数据:', saved);
          if (saved && saved.wifiName) {
            ssid = saved.wifiName;
            password = saved.wifiPassword || '';
            console.log('[WiFi] 从本地存储获取到 Wi-Fi 配置:', ssid);
          } else {
            wx.showToast({ title: '暂无 Wi-Fi 配置', icon: 'none' });
            return;
          }
        } catch (e) {
          console.error('[WiFi] 本地存储读取失败:', e);
          wx.showToast({ title: '暂无 Wi-Fi 配置', icon: 'none' });
          return;
        }
        this._connectWifi(ssid, password);
      }
    });
  },

  // 执行 WiFi 连接
  _connectWifi(ssid, password) {
    console.log('[WiFi] 开始连接 WiFi, SSID:', ssid);

    if (!ssid) {
      wx.showToast({ title: 'Wi-Fi 配置为空', icon: 'none' });
      return;
    }

    wx.startWifi({
      success: () => {
        console.log('[WiFi] startWifi 成功');
        wx.connectWifi({
          SSID: ssid,
          password: password,
          success: () => {
            console.log('[WiFi] 连接成功');
            wx.showToast({ title: 'WiFi 连接成功', icon: 'success' });
          },
          fail: (err) => {
            console.error('[WiFi] 连接失败:', err);
            wx.showToast({ title: 'WiFi 连接失败', icon: 'none' });
          }
        });
      },
      fail: (err) => {
        console.error('[WiFi] startWifi 失败:', err);
        wx.showToast({ title: '请先开启 WiFi', icon: 'none' });
      }
    });
  },

  // 分享给朋友
  onShareAppMessage() {
    const config = this.data.shareConfig;
    return {
      title: config.shareTitle,
      path: config.path,
      imageUrl: config.shareImage
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const config = this.data.shareConfig;
    return {
      title: config.timelineTitle,
      imageUrl: config.timelineImage
    };
  }
});
