// pages/admin/admin.js
Page({

  data: {
    activeTab: 'stats',

    // ===== 数据统计 =====
    todaySales: 2580,
    orderCount: 45,
    avgOrderValue: 57,
    productRanking: [
      { rank: 1, name: '经典热可可', sales: 128, revenue: 3584 },
      { rank: 2, name: '拿铁咖啡',   sales: 96,  revenue: 2880 },
      { rank: 3, name: '榛子可可',   sales: 72,  revenue: 2304 },
      { rank: 4, name: '美式咖啡',   sales: 54,  revenue: 1350 },
      { rank: 5, name: '白巧克力可可', sales: 48, revenue: 1536 }
    ],

    // ===== 商品管理 =====
    activeCategoryFilter: 'all',
    categoryFilters: [
      { value: 'all',    label: '全部',        count: 0 },
      { value: 'coco',   label: '可可',        count: 0 },
      { value: 'coffee', label: '咖啡',        count: 0 },
      { value: 'icecream', label: '冰淇淋',    count: 0 },
      { value: 'other',  label: '无咖啡因饮品', count: 0 }
    ],
    products: [],
    filteredProducts: [],
    productsLoading: false,

    // 商品弹窗
    showProductModal: false,
    editingProduct: {
      id: null,
      name: '',
      price: '',
      category: 'coco',
      categoryLabel: '可可',
      categoryIndex: 0,
      saleStatus: 'on',
      spec: '',
      supportIce: false,
      supportHot: false,
      supportNormal: false,
      scoopOptions: [],
      scoopChecked: { 单球: false, 双球: false, 三球: false, 四球: false },
      imagePreview: ''
    },
    categoryOptions: [
      { value: 'coco',     label: '可可' },
      { value: 'coffee',   label: '咖啡' },
      { value: 'icecream', label: '冰淇淋' },
      { value: 'other',    label: '无咖啡因饮品' }
    ],

    // ===== 订单管理 =====
    activeOrderFilter: 'all',
    orderFilters: [
      { value: 'all',      label: '全部',   count: 2 },
      { value: 'pending',  label: '待支付', count: 0 },
      { value: 'making',   label: '制作中', count: 1 },
      { value: 'ready',    label: '待取餐', count: 1 },
      { value: 'done',     label: '已完成', count: 0 }
    ],
    orders: [
      {
        id: 'O001',
        status: 'making',
        pickupNo: 'A05',
        type: 'dine',
        userName: '微信用户',
        time: '04-03 18:04',
        items: [
          { name: '经典热可可', temp: '热', qty: 1, price: 28 },
          { name: '拿铁咖啡',   temp: '冷', qty: 2, price: 60 }
        ],
        total: 88
      },
      {
        id: 'O002',
        status: 'ready',
        pickupNo: 'B12',
        type: 'takeaway',
        userName: '微信用户',
        time: '04-03 18:07',
        items: [
          { name: '巧克力冰淇淋', temp: '', qty: 2, price: 50 }
        ],
        total: 50
      }
    ],
    filteredOrders: [],

    // ===== 首页内容 =====
    wifiName: 'CoffeeShop_Guest',
    wifiPassword: 'StoreWifi2024',
    _wifiNameSaved: 'CoffeeShop_Guest',
    _wifiPasswordSaved: 'StoreWifi2024',

    // 英雄区轮播图（heroImages 为显示用临时 URL，_heroFileIDs 为云存储 fileID）
    heroImages: [],
    _heroFileIDs: [],
    _heroModified: false  // 是否有未保存的修改，true 时 onShow 不刷新
  },

  onLoad() {
    this._initCloudDB();
    this.loadHomeSettings();
    this._loadProductsFromCloud();
    this._applyOrderFilter('all');
  },

  // 调用云函数自动创建所需数据库集合
  async _initCloudDB() {
    try {
      await wx.cloud.callFunction({ name: 'initDB' });
    } catch (e) {
      console.warn('[initDB] 初始化集合失败（不影响使用）', e);
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  // ===== 商品管理 =====

  // 从云数据库加载商品列表
  async _loadProductsFromCloud() {
    this.setData({ productsLoading: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'initDB', data: { action: 'getProducts' } });
      const products = (res.result && res.result.data) || [];
      this.setData({ products, productsLoading: false });
      this._refreshCategoryFilters(products);
      this._applyProductFilter(this.data.activeCategoryFilter, products);
    } catch (e) {
      console.warn('[Products] 加载失败', e);
      this.setData({ productsLoading: false });
    }
  },

  // 刷新分类筛选器的数量
  _refreshCategoryFilters(products) {
    const filters = this.data.categoryFilters.map(f => {
      if (f.value === 'all') return { ...f, count: products.length };
      return { ...f, count: products.filter(p => p.category === f.value).length };
    });
    this.setData({ categoryFilters: filters });
  },

  _applyProductFilter(category, products) {
    const list = products || this.data.products;
    const filtered = category === 'all' ? list : list.filter(p => p.category === category);
    this.setData({ filteredProducts: filtered, activeCategoryFilter: category });
  },

  onCategoryFilter(e) {
    this._applyProductFilter(e.currentTarget.dataset.value);
  },

  onAddProduct() {
    const categoryOptions = this.data.categoryOptions;
    this.setData({
      showProductModal: true,
      editingProduct: {
        id: null,
        name: '',
        price: '',
        category: categoryOptions[0].value,
        categoryLabel: categoryOptions[0].label,
        categoryIndex: 0,
        saleStatus: 'on',
        spec: '',
        supportIce: false,
        supportHot: false,
        supportNormal: false,
        scoopOptions: [],
        scoopChecked: { 单球: false, 双球: false, 三球: false, 四球: false },
        imagePreview: '',
        imageFileID: ''
      }
    });
  },

  onEditProduct(e) {
    const id = e.currentTarget.dataset.id;
    const product = this.data.products.find(p => p._id === id);
    if (!product) return;
    const categoryOptions = this.data.categoryOptions;
    const categoryIndex = categoryOptions.findIndex(c => c.value === product.category);
    // 兼容旧数据：supportIceHot:true 映射为 supportIce+supportHot
    const legacyIceHot = product.supportIceHot || false;
    this.setData({
      showProductModal: true,
      editingProduct: {
        id: product._id,
        name: product.name,
        price: String(product.price),
        category: product.category,
        categoryLabel: product.categoryLabel,
        categoryIndex: categoryIndex >= 0 ? categoryIndex : 0,
        saleStatus: product.saleStatus,
        spec: product.spec || '',
        supportIce: product.supportIce !== undefined ? product.supportIce : legacyIceHot,
        supportHot: product.supportHot !== undefined ? product.supportHot : legacyIceHot,
        supportNormal: product.supportNormal || false,
        scoopOptions: product.scoopOptions || [],
        scoopChecked: {
          单球: (product.scoopOptions || []).indexOf('单球') >= 0,
          双球: (product.scoopOptions || []).indexOf('双球') >= 0,
          三球: (product.scoopOptions || []).indexOf('三球') >= 0,
          四球: (product.scoopOptions || []).indexOf('四球') >= 0
        },
        imagePreview: product.imageURL || product.image || '',
        imageFileID: product.imageFileID || ''
      }
    });
  },

  onCloseProductModal() {
    this.setData({ showProductModal: false });
  },

  // 选择商品图片并立即上传到云存储
  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this.setData({ 'editingProduct.imagePreview': path });
        wx.showLoading({ title: '上传中...', mask: true });
        try {
          const rawExt = path.split('?')[0].split('.').pop() || '';
          const ext = rawExt.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'jpg';
          const cloudPath = `products/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const uploadRes = await new Promise((resolve, reject) => {
            wx.cloud.uploadFile({ cloudPath, filePath: path, success: resolve, fail: reject });
          });
          const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
          this.setData({
            'editingProduct.imagePreview': urlRes.fileList[0].tempFileURL,
            'editingProduct.imageFileID': uploadRes.fileID
          });
          wx.hideLoading();
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '图片上传失败', icon: 'none' });
        }
      }
    });
  },

  onInputProductName(e) {
    this.setData({ 'editingProduct.name': e.detail.value });
  },

  onPickerCategory(e) {
    const index = parseInt(e.detail.value);
    const option = this.data.categoryOptions[index];
    const update = {
      'editingProduct.categoryIndex': index,
      'editingProduct.category': option.value,
      'editingProduct.categoryLabel': option.label
    };
    // 切换类别时重置拼球选项，避免残留数据写入数据库
    if (option.value !== 'icecream') {
      update['editingProduct.scoopOptions'] = [];
      update['editingProduct.scoopChecked'] = { 单球: false, 双球: false, 三球: false, 四球: false };
    }
    this.setData(update);
  },

  onInputProductPrice(e) {
    this.setData({ 'editingProduct.price': e.detail.value });
  },

  onInputSpec(e) {
    this.setData({ 'editingProduct.spec': e.detail.value });
  },

  onSelectStatus(e) {
    this.setData({ 'editingProduct.saleStatus': e.currentTarget.dataset.status });
  },

  onToggleIce() {
    this.setData({ 'editingProduct.supportIce': !this.data.editingProduct.supportIce });
  },

  onToggleHot() {
    this.setData({ 'editingProduct.supportHot': !this.data.editingProduct.supportHot });
  },

  onToggleNormal() {
    this.setData({ 'editingProduct.supportNormal': !this.data.editingProduct.supportNormal });
  },

  onToggleScoop(e) {
    const val = e.currentTarget.dataset.val;
    const current = this.data.editingProduct.scoopOptions.slice();
    const idx = current.indexOf(val);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(val);
    }
    const checked = {
      单球: current.indexOf('单球') >= 0,
      双球: current.indexOf('双球') >= 0,
      三球: current.indexOf('三球') >= 0,
      四球: current.indexOf('四球') >= 0
    };
    this.setData({
      'editingProduct.scoopOptions': current,
      'editingProduct.scoopChecked': checked
    });
  },

  async onSaveProduct() {
    const ep = this.data.editingProduct;
    if (!ep.name) { wx.showToast({ title: '请输入商品名称', icon: 'none' }); return; }
    if (!ep.price) { wx.showToast({ title: '请输入价格', icon: 'none' }); return; }

    const productData = {
      name: ep.name,
      price: ep.price,
      category: ep.category,
      categoryLabel: ep.categoryLabel,
      saleStatus: ep.saleStatus,
      spec: ep.spec || '',
      supportIce: ep.supportIce || false,
      supportHot: ep.supportHot || false,
      supportNormal: ep.supportNormal || false,
      scoopOptions: ep.category === 'icecream' ? (ep.scoopOptions || []) : [],
      imageFileID: ep.imageFileID || '',
      imageURL: ep.imagePreview || ''
    };

    wx.showLoading({ title: '保存中...', mask: true });
    try {
      if (ep.id) {
        await wx.cloud.callFunction({ name: 'initDB', data: { action: 'updateProduct', id: ep.id, product: productData } });
      } else {
        await wx.cloud.callFunction({ name: 'initDB', data: { action: 'addProduct', product: productData } });
      }
      wx.hideLoading();
      this.setData({ showProductModal: false });
      wx.showToast({ title: '保存成功', icon: 'success' });
      this._loadProductsFromCloud();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      console.error('[Products] 保存失败', e);
    }
  },

  onDeleteProduct(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，是否继续？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...', mask: true });
          try {
            await wx.cloud.callFunction({ name: 'initDB', data: { action: 'deleteProduct', id } });
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            this._loadProductsFromCloud();
          } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // ===== 订单管理 =====
  _applyOrderFilter(status) {
    const orders = this.data.orders;
    const filtered = status === 'all'
      ? orders
      : orders.filter(o => o.status === status);
    this.setData({ filteredOrders: filtered, activeOrderFilter: status });
  },

  onOrderFilter(e) {
    this._applyOrderFilter(e.currentTarget.dataset.value);
  },

  onRefundOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认退款',
      content: '退款后订单将关闭，是否继续？',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '退款成功', icon: 'success' });
          const orders = this.data.orders.filter(o => o.id !== id);
          this.setData({ orders });
          this._applyOrderFilter(this.data.activeOrderFilter);
        }
      }
    });
  },

  // ===== 首页内容 =====
  loadHomeSettings() {
    try {
      const saved = wx.getStorageSync('homeSettings');
      if (saved) {
        this.setData({
          wifiName: saved.wifiName || 'CoffeeShop_Guest',
          wifiPassword: saved.wifiPassword || 'StoreWifi2024',
          _wifiNameSaved: saved.wifiName || 'CoffeeShop_Guest',
          _wifiPasswordSaved: saved.wifiPassword || 'StoreWifi2024'
        });
      }
    } catch (e) {
      // ignore
    }

    // 加载英雄区轮播图（从云数据库读取，转换 fileID 为临时链接）
    this._loadHeroImagesFromCloud();
  },

  /**
   * 从云数据库加载英雄区 fileID，并转换为可显示的 https 临时链接
   * _heroFileIDs 保存原始 fileID，heroImages 保存显示用临时链接
   */
  async _loadHeroImagesFromCloud() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('heroImages').doc('config').get();
      const fileIDs = (res.data && res.data.images) || [];
      if (fileIDs.length === 0) {
        this.setData({ heroImages: [], _heroFileIDs: [] });
        return;
      }
      const urlRes = await wx.cloud.getTempFileURL({ fileList: fileIDs });
      const urls = urlRes.fileList.map(f => f.tempFileURL);
      this.setData({ heroImages: urls, _heroFileIDs: fileIDs.slice() });
    } catch (e) {
      // 加载失败时不清空已有预览，避免因网络抖动导致图片消失
      console.warn('[Hero] 加载云端图片失败', e);
    }
  },

  onInputWifiName(e) {
    this.setData({ wifiName: e.detail.value });
  },

  onInputWifiPassword(e) {
    this.setData({ wifiPassword: e.detail.value });
  },

  onSaveHomeSettings() {
    const { wifiName, wifiPassword } = this.data;
    wx.setStorageSync('homeSettings', { wifiName, wifiPassword });
    this.setData({
      _wifiNameSaved: wifiName,
      _wifiPasswordSaved: wifiPassword
    });
    wx.showToast({ title: '保存成功', icon: 'success' });
  },

  onCancelHomeSettings() {
    this.setData({
      wifiName: this.data._wifiNameSaved,
      wifiPassword: this.data._wifiPasswordSaved
    });
  },

  // ===== 英雄区轮播图 =====
  // heroImages：显示用临时链接（getTempFileURL 转换后的 https 链接）
  // _heroFileIDs：与 heroImages 一一对应的云存储 fileID
  // _heroSavedIDs：当前已保存到数据库的 fileID 列表（用于判断是否有未保存修改）

  // 上传单张图片到云存储，返回 { fileID, tempURL }
  async _uploadToCloud(filePath) {
    const rawExt = filePath.split('?')[0].split('.').pop() || '';
    const ext = rawExt.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'jpg';
    const cloudPath = `heroImages/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const uploadRes = await new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: resolve,
        fail: reject
      });
    });
    const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
    return { fileID: uploadRes.fileID, tempURL: urlRes.fileList[0].tempFileURL };
  },

  onAddHeroImage() {
    if (this.data.heroImages.length >= 3) return;
    this.setData({ _heroModified: true });
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const path = res.tempFiles[0].tempFilePath;
        // 先用本地路径即时预览
        const images = this.data.heroImages.concat([path]);
        const fileIDs = this.data._heroFileIDs.concat([null]);
        this.setData({ heroImages: images, _heroFileIDs: fileIDs });
        // 立即上传到云存储，替换为持久 fileID + 临时链接
        wx.showLoading({ title: '上传中...', mask: true });
        try {
          const { fileID, tempURL } = await this._uploadToCloud(path);
          const idx = this.data.heroImages.length - 1;
          const imgs = this.data.heroImages.slice();
          const ids = this.data._heroFileIDs.slice();
          imgs[idx] = tempURL;
          ids[idx] = fileID;
          this.setData({ heroImages: imgs, _heroFileIDs: ids });
          wx.hideLoading();
        } catch (e) {
          wx.hideLoading();
          console.error('[Hero] 上传失败', e);
          wx.showToast({ title: '上传失败，请重试', icon: 'none' });
          // 移除失败的图片
          const imgs = this.data.heroImages.slice();
          const ids = this.data._heroFileIDs.slice();
          imgs.pop(); ids.pop();
          this.setData({ heroImages: imgs, _heroFileIDs: ids });
        }
      },
      fail: () => {
        if (!this.data._heroFileIDs.some(id => id === null)) {
          this.setData({ _heroModified: false });
        }
      }
    });
  },

  onReplaceHeroImage(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({ _heroModified: true });
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const path = res.tempFiles[0].tempFilePath;
        // 先用本地路径即时预览
        const imgs = this.data.heroImages.slice();
        const ids = this.data._heroFileIDs.slice();
        imgs[index] = path;
        ids[index] = null;
        this.setData({ heroImages: imgs, _heroFileIDs: ids });
        // 立即上传到云存储
        wx.showLoading({ title: '上传中...', mask: true });
        try {
          const { fileID, tempURL } = await this._uploadToCloud(path);
          const imgs2 = this.data.heroImages.slice();
          const ids2 = this.data._heroFileIDs.slice();
          imgs2[index] = tempURL;
          ids2[index] = fileID;
          this.setData({ heroImages: imgs2, _heroFileIDs: ids2 });
          wx.hideLoading();
        } catch (e) {
          wx.hideLoading();
          console.error('[Hero] 替换上传失败', e);
          wx.showToast({ title: '上传失败，请重试', icon: 'none' });
        }
      },
      fail: () => {
        if (!this.data._heroFileIDs.some(id => id === null)) {
          this.setData({ _heroModified: false });
        }
      }
    });
  },

  onDeleteHeroImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.heroImages.slice();
    const fileIDs = this.data._heroFileIDs.slice();
    images.splice(index, 1);
    fileIDs.splice(index, 1);
    this.setData({ heroImages: images, _heroFileIDs: fileIDs, _heroModified: true });
  },

  /**
   * 保存：所有图片已在选图时上传，此处只需把 fileID 列表写入数据库
   */
  async onSaveHeroImages() {
    const { _heroFileIDs } = this.data;
    wx.showLoading({ title: '保存中...', mask: true });
    try {
      await wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'setHeroImages', images: _heroFileIDs.filter(Boolean) }
      });
      this.setData({ _heroModified: false });
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      console.error('[Hero] onSaveHeroImages 失败', e);
      wx.showToast({ title: `保存失败: ${e.errMsg || e.message || '未知错误'}`, icon: 'none', duration: 3000 });
    }
  },

  onCancelHeroImages() {
    this.setData({ _heroModified: false });
    this._loadHeroImagesFromCloud();
  },

  onReady() {},
  onShow() {
    // 有未保存的修改时不刷新，避免覆盖本地预览图
    if (this.data._heroModified) return;
    this._loadHeroImagesFromCloud();
  },
  onHide() {},
  onUnload() {},
  onPullDownRefresh() {},
  onReachBottom() {},
  onShareAppMessage() {}
})
