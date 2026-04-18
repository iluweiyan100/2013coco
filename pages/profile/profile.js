// pages/profile/profile.js
Page({
  data: {
    isLogin: false, // 登录状态
    userInfo: {}, // 用户信息对象
    tempAvatarUrl: '', // 临时头像 URL
    tempNickname: '', // 临时昵称
    tempPhone: '' // 临时手机号
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
    const openid = wx.getStorageSync('openid');
    if (userInfo && userInfo.nickName && openid) {
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

  // 选择头像
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    this.setData({
      tempAvatarUrl: avatarUrl
    });
  },

  // 输入昵称
  onNicknameInput(e) {
    this.setData({
      tempNickname: e.detail.value
    });
  },

  // 输入手机号
  onPhoneInput(e) {
    this.setData({
      tempPhone: e.detail.value
    });
  },

  // 登录按钮点击事件
  onLogin() {
    const { tempAvatarUrl, tempNickname, tempPhone } = this.data;

    // 验证昵称
    if (!tempNickname || tempNickname.trim() === '') {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      });
      return;
    }

    // 验证头像
    if (!tempAvatarUrl) {
      wx.showToast({
        title: '请选择头像',
        icon: 'none'
      });
      return;
    }

    // 验证手机号格式（如果填写了）
    if (tempPhone && !/^1[3-9]\d{9}$/.test(tempPhone)) {
      wx.showToast({
        title: '手机号格式不正确',
        icon: 'none'
      });
      return;
    }

    const userInfo = {
      nickName: tempNickname,
      avatarUrl: tempAvatarUrl,
      phone: tempPhone || ''
    };

    // 先获取 openid 确保用户记录存在
    wx.cloud.callFunction({
      name: 'getOpenId',
      success: (openIdRes) => {
        // 再调用 updateUser 更新用户信息
        wx.cloud.callFunction({
          name: 'updateUser',
          data: {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            phone: userInfo.phone
          },
          success: (updateRes) => {
            // 保存用户信息到本地存储
            wx.setStorageSync('userInfo', userInfo);
            wx.setStorageSync('openid', updateRes.result.openid);

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
            console.error('更新用户信息失败:', err);
            wx.showToast({
              title: '登录失败',
              icon: 'none'
            });
          }
        });
      },
      fail: (err) => {
        console.error('获取 openid 失败:', err);
        wx.showToast({
          title: '登录失败',
          icon: 'none'
        });
      }
    });
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '提示',
      content: '确定要清除缓存吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            // 清除所有存储数据
            wx.clearStorageSync();
            // 重新检查登录状态
            this.checkLoginStatus();
            wx.showToast({
              title: '缓存已清除',
              icon: 'success'
            });
          } catch (e) {
            console.error('清除缓存失败:', e);
            wx.showToast({
              title: '清除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('openid');

          // 更新页面状态
          this.setData({
            isLogin: false,
            userInfo: {},
            tempAvatarUrl: '',
            tempNickname: '',
            tempPhone: ''
          });

          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          });
        }
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
        // 底部弹出菜单选项
        wx.showActionSheet({
          itemList: ['清除缓存', '退出登录'],
          success: (res) => {
            if (res.tapIndex === 0) {
              // 清除缓存
              this.clearCache();
            } else if (res.tapIndex === 1) {
              // 退出登录
              this.logout();
            }
          }
        });
        break;

      default:
        break;
    }
  }
});
