// index.js
const SUBSCRIBE = require('../../config/subscribe.js');

// 缓存有效期（毫秒）
const CACHE = {
  HERO: 10 * 60 * 1000,       // 轮播图：10分钟
  SHARE: 5 * 60 * 1000,       // 分享配置：5分钟
  FEATURED: 5 * 60 * 1000,    // 首页商品展示：5分钟
};

// 本地缓存工具
function cacheGet(key) {
  try {
    const raw = wx.getStorageSync(key);
    if (raw && raw.time && (Date.now() - raw.time < raw.ttl)) {
      return raw.data;
    }
  } catch (e) { /* 忽略 */ }
  return null;
}
function cacheSet(key, data, ttl) {
  try {
    wx.setStorageSync(key, { time: Date.now(), ttl, data });
  } catch (e) { /* 忽略 */ }
}

Page({
  data: {
    statusBarHeight: 0,
    heroImages: [],
    shareConfig: {},  // 分享配置
    featuredProducts: [],  // 首页商品展示
    shopClosed: false,
    closedTitle: '店铺已打烊',
    closedMessage: '',
    // 桌面二维码上下文
    tableContextActive: false,
    tableContextName: '',
  },

  onLoad() {
    this.setData({
      statusBarHeight: wx.getWindowInfo().statusBarHeight
    });
    // 先从缓存加载（瞬时显示），再异步拉取云端最新
    this._loadHeroImages(true);
    this._loadShareConfig(true);
    this._loadFeaturedProducts(true);
    this._loadShopStatus();
    this._loadTableContext();
  },

  onShow() {
    // 已有数据时检查缓存是否过期，不过期就不重新加载
    if (this.data.heroImages.length === 0) {
      this._loadHeroImages(true);
    } else {
      this._loadHeroImages(false); // 静默检查，过期才刷新
    }
    this._loadShareConfig(false);
    this._loadFeaturedProducts(false);
    this._loadShopStatus();
    this._loadTableContext();
  },

  // 加载打烊状态
  async _loadShopStatus() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('homeSettings').doc('config').get();
      const data = res.data || {};
      const { openingTime, closingTime, manualClosed, manualClosedDate, manualClosedUntil, closedTitle, closedMessage } = data;
      const today = new Date().toISOString().slice(0, 10);
      let effectiveManualClosed = manualClosed;
      if (manualClosed !== undefined && manualClosed !== null) {
        let expired = false;
        if (manualClosedUntil) expired = new Date() >= new Date(manualClosedUntil);
        else if (manualClosedDate && manualClosedDate < today && openingTime) {
          const h = new Date().getHours()*60+new Date().getMinutes();
          const o = parseInt(openingTime.split(':')[0])*60+parseInt(openingTime.split(':')[1]||0);
          expired = h >= o;
        }
        if (expired) { effectiveManualClosed = undefined; wx.cloud.callFunction({ name: 'initDB', data: { action: 'toggleClosed', manualClosed: null } }); }
      }
      let shopClosed;
      if (effectiveManualClosed === true) { shopClosed = true; }
      else if (effectiveManualClosed === false) { shopClosed = false; }
      else if (openingTime && closingTime) {
        const now = new Date();
        const hm = now.getHours() * 60 + now.getMinutes();
        const open = parseInt(openingTime.split(':')[0]) * 60 + parseInt(openingTime.split(':')[1] || 0);
        const close = parseInt(closingTime.split(':')[0]) * 60 + parseInt(closingTime.split(':')[1] || 0);
        shopClosed = hm < open || hm >= close;
      } else { shopClosed = false; }
      this.setData({ shopClosed, closedTitle: closedTitle || '店铺已打烊', closedMessage: closedMessage || '' });
      // 缓存供 order 页兜底检查
      wx.setStorageSync('_cache_shopStatus', { closed: shopClosed, title: closedTitle || '店铺已打烊' });
    } catch (e) { console.warn('[Index] 加载打烊状态失败', e); }
  },

  // 订阅消息授权（必须在 tap 事件同步栈中调用，2 秒内不重复触发）
  _renewSubscribe() {
    const now = Date.now();
    if (this._subscribePending) { console.log('[Subscribe] 上次请求未结束'); return; }
    if (this._lastSubscribeTime && now - this._lastSubscribeTime < 3000) {
      console.log('[Subscribe] 3秒内已调用过，跳过');
      return;
    }
    this._subscribePending = true;
    this._lastSubscribeTime = now;
    wx.requestSubscribeMessage({
      tmplIds: [SUBSCRIBE.PAYMENT_SUCCESS, SUBSCRIBE.PICKUP_NOTIFY],
      success: (res) => {
        if (res[SUBSCRIBE.PAYMENT_SUCCESS] === 'accept') {
          console.log('[Subscribe] 付款成功通知: 已授权');
        }
        if (res[SUBSCRIBE.PICKUP_NOTIFY] === 'accept') {
          console.log('[Subscribe] 取餐通知: 已授权');
        }
      },
      fail: (err) => {
        console.log('[Subscribe] 授权失败（可忽略）:', err.errMsg);
      },
      complete: () => {
        this._subscribePending = false;
      },
    });
  },

  // 加载分享配置（带缓存）
  async _loadShareConfig(force) {
    const CACHE_KEY = '_cache_shareConfig';
    const ttl = CACHE.SHARE;

    // 先读缓存显示
    if (force && this.data.shareConfig && !this.data.shareConfig.shareTitle) {
      const cached = cacheGet(CACHE_KEY);
      if (cached) {
        this.setData({ shareConfig: cached });
      }
    }

    // 缓存未过期则跳过网络请求
    if (!force && cacheGet(CACHE_KEY)) return;

    try {
      const db = wx.cloud.database();
      const res = await db.collection('share_config').doc('index_share').get();
      if (res.data) {
        const raw = res.data;
        const fileIDs = [];
        if (raw.shareImage && raw.shareImage.startsWith('cloud://')) {
          fileIDs.push(raw.shareImage);
        }
        if (raw.timelineImage && raw.timelineImage.startsWith('cloud://')) {
          fileIDs.push(raw.timelineImage);
        }
        let shareConfig;
        if (fileIDs.length > 0) {
          try {
            const urlRes = await wx.cloud.getTempFileURL({ fileList: fileIDs });
            const urlMap = {};
            urlRes.fileList.forEach((item, i) => { urlMap[fileIDs[i]] = item.tempFileURL; });
            shareConfig = {
              shareTitle: raw.shareTitle || '',
              timelineTitle: raw.timelineTitle || '',
              shareImage: urlMap[raw.shareImage] || raw.shareImage,
              timelineImage: urlMap[raw.timelineImage] || raw.timelineImage,
              path: raw.path || ''
            };
          } catch (urlErr) {
            console.warn('[Index] 转换图片链接失败', urlErr);
            shareConfig = raw;
          }
        } else {
          shareConfig = res.data;
        }
        this.setData({ shareConfig });
        cacheSet(CACHE_KEY, shareConfig, ttl);
        console.log('[Index] 加载分享配置成功');
      }
    } catch (e) {
      console.log('[Index] 加载分享配置失败，使用缓存/默认');
    }
  },

  // 加载轮播图（带缓存）
  async _loadHeroImages(force) {
    const CACHE_KEY = '_cache_heroImages';
    const ttl = CACHE.HERO;

    // 先读缓存
    if (force) {
      const cached = cacheGet(CACHE_KEY);
      if (cached && cached.length > 0) {
        this.setData({ heroImages: cached });
      }
    }

    // 缓存未过期则跳过
    if (!force && cacheGet(CACHE_KEY)) return;

    try {
      const db = wx.cloud.database();
      const res = await db.collection('heroImages').doc('config').get();
      const images = (res.data && res.data.images) || [];
      if (images.length === 0) {
        this.setData({ heroImages: [] });
        cacheSet(CACHE_KEY, [], ttl);
        return;
      }
      const fileList = images.map(img => img.fileID || img).filter(Boolean);
      const urlRes = await wx.cloud.getTempFileURL({ fileList });
      const urls = urlRes.fileList.map(f => f.tempFileURL);
      this.setData({ heroImages: urls });
      cacheSet(CACHE_KEY, urls, ttl);
    } catch (e) {
      console.warn('[Index] 加载轮播图失败', e);
    }
  },

  // 加载首页商品展示（带缓存，通过云函数避免客户端DB权限问题）
  async _loadFeaturedProducts(force) {
    const CACHE_KEY = '_cache_featuredProducts';
    const ttl = CACHE.FEATURED;

    // 先读缓存显示
    if (force) {
      const cached = cacheGet(CACHE_KEY);
      if (cached && cached.length > 0) {
        this.setData({ featuredProducts: cached });
      }
    }

    // 缓存未过期则跳过
    if (!force && cacheGet(CACHE_KEY)) return;

    try {
      const res = await wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'getFeaturedProducts' },
      });
      const items = (res.result && res.result.data) || [];
      if (items.length === 0) {
        this.setData({ featuredProducts: [] });
        cacheSet(CACHE_KEY, [], ttl);
        return;
      }
      const fileIDs = items.map(i => i.imageFileID).filter(Boolean);
      if (fileIDs.length === 0) {
        this.setData({ featuredProducts: [] });
        return;
      }
      const urlRes = await wx.cloud.getTempFileURL({ fileList: fileIDs });
      const urlMap = {};
      urlRes.fileList.forEach((f, i) => { urlMap[fileIDs[i]] = f.tempFileURL; });
      const featuredProducts = items.map(item => ({
        productId: item.productId,
        imageURL: urlMap[item.imageFileID] || item.imageFileID,
        name: item.name || '',
      }));
      this.setData({ featuredProducts });
      cacheSet(CACHE_KEY, featuredProducts, ttl);
    } catch (e) {
      console.warn('[Index] 加载首页商品展示失败', e);
    }
  },

  // 点击首页展示商品 → 跳转点单页并定位
  onFeaturedTap(e) {
    const productId = e.currentTarget.dataset.id;
    wx.reLaunch({
      url: `/pages/order/order?type=dine-in&scrollTo=${productId}`
    });
  },

  // 堂食点击
  onDineInTap() {
    if (this.data.shopClosed) { wx.showToast({ title: this.data.closedTitle, icon: 'none' }); return; }
    console.log('选择堂食');
    this._renewSubscribe();  // 续期订阅授权（必须tap同步栈）
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
    if (this.data.shopClosed) { wx.showToast({ title: this.data.closedTitle, icon: 'none' }); return; }
    console.log('选择外带');
    this._renewSubscribe();
    wx.reLaunch({ url: '/pages/order/order?type=takeaway' });
  },

  // 长按外带3秒 → 管理员入口
  onTakeawayLongPress() {
    console.log('外带长按，验证管理员身份');
    wx.showLoading({ title: '验证中...' });
    wx.cloud.callFunction({
      name: 'verifyAdminAuth',
      success: (res) => {
        wx.hideLoading();
        if (res.result.success && res.result.authorized) {
          wx.vibrateShort({ type: 'heavy' });
          wx.showToast({ title: `欢迎 ${res.result.data.name}`, icon: 'success' });
          setTimeout(() => { wx.navigateTo({ url: '/pages/admin/admin' }); }, 1500);
        } else {
          wx.showToast({ title: '无权访问管理后台', icon: 'none' });
        }
      },
      fail: (err) => { wx.hideLoading(); wx.showToast({ title: '验证失败', icon: 'none' }); }
    });
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

  // 打烊浮窗三连击 → 管理员入口
  onOverlayTap() {
    if (!this.data.shopClosed) return;
    this.data._overlayTapCount = (this.data._overlayTapCount || 0) + 1;
    if (this.data._overlayTimer) clearTimeout(this.data._overlayTimer);
    if (this.data._overlayTapCount >= 3) {
      this.data._overlayTapCount = 0;
      wx.showLoading({ title: '验证中...' });
      wx.cloud.callFunction({
        name: 'verifyAdminAuth',
        success: (res) => {
          wx.hideLoading();
          if (res.result.success && res.result.authorized) {
            wx.vibrateShort({ type: 'heavy' });
            wx.showToast({ title: `欢迎 ${res.result.data.name}`, icon: 'success' });
            setTimeout(() => { wx.navigateTo({ url: '/pages/admin/admin' }); }, 1500);
          } else { wx.showToast({ title: '无权访问', icon: 'none' }); }
        },
        fail: () => { wx.hideLoading(); wx.showToast({ title: '验证失败', icon: 'none' }); }
      });
      return;
    }
    this.data._overlayTimer = setTimeout(() => { this.data._overlayTapCount = 0; }, 500);
  },

  // 打烊浮窗长按 → 店员入口
  onOverlayLongPress() {
    if (!this.data.shopClosed) return;
    wx.showLoading({ title: '验证中...' });
    wx.cloud.callFunction({
      name: 'verifyStaffAuth',
      success: (res) => {
        wx.hideLoading();
        if (res.result.success && res.result.authorized) {
          wx.vibrateShort({ type: 'heavy' });
          wx.showToast({ title: `欢迎 ${res.result.data.name}`, icon: 'success' });
          setTimeout(() => { wx.navigateTo({ url: '/pages/staff/staff' }); }, 1500);
        } else { wx.showToast({ title: '无权访问', icon: 'none' }); }
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '验证失败', icon: 'none' }); }
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
  },

  // 加载桌面二维码上下文
  _loadTableContext() {
    const app = getApp();
    let ctx = app.globalData.tableContext;
    if (!ctx) {
      try {
        ctx = wx.getStorageSync('tableContext') || null;
      } catch (e) { /* ignore */ }
    }

    if (ctx && ctx.code) {
      if (ctx.tableName) {
        this.setData({
          tableContextActive: true,
          tableContextName: ctx.tableName
        });
      } else {
        // 有 code 但无 name，通过云函数查询（服务端权限）
        this.setData({ tableContextActive: true, tableContextName: '' });
        wx.cloud.callFunction({
          name: 'initDB',
          data: { action: 'getTableByCode', code: ctx.code }
        }).then(res => {
          if (res.result && res.result.success && res.result.data) {
            const table = res.result.data;
            this.setData({ tableContextName: table.name });
            ctx.tableName = table.name;
            ctx.tableId = table._id;
            app.globalData.tableContext = ctx;
            wx.setStorageSync('tableContext', ctx);
          } else {
            this.setData({ tableContextName: '桌位码已失效' });
          }
        }).catch(() => {});
      }
    } else {
      this.setData({ tableContextActive: false, tableContextName: '' });
    }
  },

  // 退出桌位
  onClearTableContext() {
    wx.showModal({
      title: '退出桌位',
      content: '确定要退出当前桌位吗？',
      success: (res) => {
        if (res.confirm) {
          getApp().globalData.tableContext = null;
          wx.removeStorageSync('tableContext');
          this.setData({ tableContextActive: false, tableContextName: '' });
        }
      }
    });
  }
});
