// app.js
App({
  onLaunch: function(options) {
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

    // 处理扫码 scene（冷启动，始终处理）
    this._handleLaunchScene(options, { clearOnNoScene: true });
  },

  // 处理热启动扫码（不清除已有上下文，避免切换Tab丢失桌位）
  onShow: function(options) {
    this._handleLaunchScene(options, { clearOnNoScene: false });
  },

  // 加载自定义字体
  // 处理扫码 scene（桌面二维码等场景值）
  async _handleLaunchScene(options, { clearOnNoScene } = {}) {
    try {
      // 从 query.scene 取（getwxacodeunlimit 生成的小程序码会将 scene 放在 query 中）
      let rawScene = '';
      if (options && options.query && options.query.scene) {
        rawScene = decodeURIComponent(options.query.scene);
      } else if (options && options.scene) {
        rawScene = decodeURIComponent(options.scene);
      }

      console.log('[App] _handleLaunchScene rawScene:', rawScene);

      // 非桌位 scene
      if (!rawScene || !rawScene.startsWith('t=')) {
        // 冷启动才清除上下文，热启动不清除（避免切换Tab或切后台回来丢失桌位）
        if (clearOnNoScene) {
          this.globalData.tableContext = null;
          wx.removeStorageSync('tableContext');
        }
        return;
      }

      const code = rawScene.slice(2);
      if (!code || code.length > 32) {
        if (clearOnNoScene) {
          this.globalData.tableContext = null;
          wx.removeStorageSync('tableContext');
        }
        return;
      }

      // 如果与当前上下文相同，跳过重复查询
      if (this.globalData.tableContext && this.globalData.tableContext.code === code && this.globalData.tableContext.tableName) {
        return;
      }

      // ★ 先同步写入初步上下文（code 已知，name 待查），防止 index.onLoad 竞态读空
      const pendingCtx = { tableId: '', tableName: '', code: code };
      this.globalData.tableContext = pendingCtx;
      wx.setStorageSync('tableContext', pendingCtx);
      console.log('[App] 初步上下文已写入（待查库）:', code);

      // 通过云函数查询桌位信息（服务端权限，避免客户端读权限限制）
      const res = await wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'getTableByCode', code }
      });

      if (res.result && res.result.success && res.result.data) {
        const table = res.result.data;
        const ctx = {
          tableId: table._id,
          tableName: table.name,
          code: code
        };
        this.globalData.tableContext = ctx;
        wx.setStorageSync('tableContext', ctx);
        console.log('[App] 桌位上下文已设置:', JSON.stringify(ctx));
      } else {
        // 桌位不存在或已禁用（保留 code 供前端提示"已失效"）
        console.log('[App] 桌位码未找到或已禁用:', code);
      }
    } catch (err) {
      console.warn('[App] _handleLaunchScene 解析失败:', err.message);
    }
  },

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
    user: null, // 用户完整信息 { _id, openid, nickName, avatarUrl, createTime, updateTime }
    tableContext: null // { tableId, tableName, code } | null — 桌面二维码上下文
  }
}); 