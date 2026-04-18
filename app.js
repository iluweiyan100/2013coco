// app.js
App({
  onLaunch: function() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-8grqm06168739c22', // 云开发环境 ID
        traceUser: true,
      });
    }

    // 获取用户 openid
    this.getOpenId();
  },

  // 获取 openid
  getOpenId() {
    wx.cloud.callFunction({
      name: 'getOpenId',
      success: res => {
        console.log('用户 OpenID:', res.result.openid);
        this.globalData.openid = res.result.openid;
        this.globalData.user = res.result.user;

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