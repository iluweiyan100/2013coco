// app.js
App({
  onLaunch: function() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud3-d2gbcvyqkbc0fbf94', // 云开发环境 ID
        traceUser: true,
      });
    }

    // 动态加载仓耳舒圆体字体
    this.loadCustomFont();

    // 获取用户 openid
    this.getOpenId();
  },

  // 加载自定义字体
  loadCustomFont() {
    const fileId = 'cloud://cloud3-d2gbcvyqkbc0fbf94.636c-cloud3-d2gbcvyqkbc0fbf94-1419079738/fonts/仓耳舒圆体 W03.TTF';
    
    const loadFont = (url) => {
      wx.loadFontFace({
        family: 'CangerShuYuanTi',
        source: url,
        scopes: ['webview', 'native'],
        success: (fontRes) => {
          console.log('仓耳舒圆体字体加载成功', fontRes);
        },
        fail: (err) => {
          console.error('仓耳舒圆体字体加载失败', err);
          console.warn('将回退到系统字体');
        }
      });
    };

    try {
      // 获取字体文件的临时下载链接
      wx.cloud.getTempFileURL({
        fileList: [fileId],
        success: (res) => {
          if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
            const fontUrl = res.fileList[0].tempFileURL;
            console.log('字体临时链接获取成功:', fontUrl);
            loadFont(fontUrl);
          } else {
            console.error('临时链接返回格式异常', res);
          }
        },
        fail: (err) => {
          console.error('获取字体临时链接失败', err);
          
          // 尝试直接使用云存储 CDN 地址
          const cdnUrl = 'https://636c-cloud3-d2gbcvyqkbc0fbf94-1419079738.tcb.qcloud.la/fonts/仓耳舒圆体 W03.TTF';
          console.log('尝试使用 CDN 链接:', cdnUrl);
          loadFont(cdnUrl);
        }
      });
    } catch (e) {
      console.error('字体加载异常', e);
      
      // 兜底方案
      const cdnUrl = 'https://636c-cloud3-d2gbcvyqkbc0fbf94-1419079738.tcb.qcloud.la/fonts/仓耳舒圆体 W03.TTF';
      loadFont(cdnUrl);
    }
  },

  // 获取 openid
  getOpenId() {
    wx.cloud.callFunction({
      name: 'getOpenId',
      success: res => {
        console.log('用户 OpenID:', res.result.openid);
        this.globalData.openid = res.result.openid;
        this.globalData.user = res.result.user;

        // 同步存入 Storage，方便各页面同步读取
        wx.setStorageSync('openid', res.result.openid);

        // 触发 openid 准备就绪回调
        if (this.openidReadyCallback) {
          this.openidReadyCallback(res.result);
        }
      },
      fail: err => {
        console.error('获取用户信息失败:', err);
      }
    });
  },
  
  globalData: {
    cartItems: [], // { uid, id, name, price, image, category, spec, orderType, qty }
    openid: '',
    user: null // 用户完整信息 { _id, openid, nickName, avatarUrl, createTime, updateTime }
  }
}); 