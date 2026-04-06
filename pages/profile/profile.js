// pages/profile/profile.js
Page({
  data: {
    isLogin: false, // 登录状态
    userInfo: {} // 用户信息对象
  },

  onLoad(options) {
    this.checkLoginStatus();
  },

  onShow() {
    // 每次显示页面时检查登录状态
    this.checkLoginStatus();
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.nickName) {
      this.setData({
        isLogin: true,
        userInfo: userInfo
      });
    } else {
      this.setData({
        isLogin: false,
        userInfo: {}
      });
    }
  },

  // 登录按钮点击事件
  onLogin() {
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: (res) => {
        const userInfo = res.userInfo;
        
        // 保存用户信息到本地存储
        wx.setStorageSync('userInfo', userInfo);
        
        // 更新页面数据
        this.setData({
          isLogin: true,
          userInfo: userInfo
        });

        wx.showToast({
          title: '登录成功',
          icon: 'success'
        });
      },
      fail: (err) => {
        console.error('登录失败:', err);
        wx.showToast({
          title: '登录取消',
          icon: 'none'
        });
      }
    });
  },

  // 功能菜单点击事件
  onMenuItem(e) {
    const action = e.currentTarget.dataset.action;
    
    switch (action) {
      case 'orders':
        // 跳转到订单历史页
        wx.navigateTo({
          url: '/pages/orders/orders'
        });
        break;
      
      case 'service':
        // 联系客服（功能开发中）
        wx.showToast({
          title: '功能开发中',
          icon: 'none'
        });
        break;
      
      case 'settings':
        // 设置（功能开发中）
        wx.showToast({
          title: '功能开发中',
          icon: 'none'
        });
        break;
      
      default:
        break;
    }
  },

  // 底部 TabBar 切换
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    
    // 如果点击的是当前页面，不做处理
    if (tab === 'profile') {
      return;
    }

    // 页面映射
    const pages = {
      'home': '/pages/index/index',
      'order': '/pages/order/order',
      'orders': '/pages/orders/orders'
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
  }
});
