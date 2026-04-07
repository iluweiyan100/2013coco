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
      { value: 'all',    label: '全部',      count: 16 },
      { value: 'coco',   label: '可可',      count: 4  },
      { value: 'coffee', label: '咖啡',      count: 4  },
      { value: 'icecream', label: '冰淇淋',  count: 4  },
      { value: 'other',  label: '无咖啡因饮品', count: 4 }
    ],
    products: [
      { id: 1,  name: '经典热可可',   price: '28', category: 'coco',     categoryLabel: '可可',      saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/3.svg',  spec: '', supportIceHot: true  },
      { id: 2,  name: '榛子可可',     price: '32', category: 'coco',     categoryLabel: '可可',      saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/6.svg',  spec: '', supportIceHot: true  },
      { id: 3,  name: '白巧克力可可', price: '32', category: 'coco',     categoryLabel: '可可',      saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/9.svg',  spec: '', supportIceHot: true  },
      { id: 4,  name: '摩卡可可',     price: '35', category: 'coco',     categoryLabel: '可可',      saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/12.svg', spec: '', supportIceHot: true  },
      { id: 5,  name: '美式咖啡',     price: '25', category: 'coffee',   categoryLabel: '咖啡',      saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/15.svg', spec: '', supportIceHot: true  },
      { id: 6,  name: '拿铁咖啡',     price: '30', category: 'coffee',   categoryLabel: '咖啡',      saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/18.svg', spec: '', supportIceHot: true  },
      { id: 7,  name: '卡布奇诺',     price: '30', category: 'coffee',   categoryLabel: '咖啡',      saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/21.svg', spec: '', supportIceHot: true  },
      { id: 8,  name: '焦糖玛奇朵',   price: '35', category: 'coffee',   categoryLabel: '咖啡',      saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/24.svg', spec: '', supportIceHot: true  },
      { id: 9,  name: '香草冰淇淋',   price: '22', category: 'icecream', categoryLabel: '冰淇淋',    saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/27.svg', spec: '单球/双球', supportIceHot: false },
      { id: 10, name: '巧克力冰淇淋', price: '25', category: 'icecream', categoryLabel: '冰淇淋',    saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/30.svg', spec: '单球/双球', supportIceHot: false },
      { id: 11, name: '草莓冰淇淋',   price: '25', category: 'icecream', categoryLabel: '冰淇淋',    saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/33.svg', spec: '单球/双球', supportIceHot: false },
      { id: 12, name: '抹茶冰淇淋',   price: '28', category: 'icecream', categoryLabel: '冰淇淋',    saleStatus: 'on',  image: '/assets/CodeBubbyAssets/4_745/36.svg', spec: '单球/双球', supportIceHot: false },
      { id: 13, name: '奶茶',         price: '20', category: 'other',    categoryLabel: '无咖啡因饮品', saleStatus: 'on', image: '/assets/CodeBubbyAssets/4_745/39.svg', spec: '', supportIceHot: true  },
      { id: 14, name: '水果茶',       price: '22', category: 'other',    categoryLabel: '无咖啡因饮品', saleStatus: 'on', image: '/assets/CodeBubbyAssets/4_745/42.svg', spec: '', supportIceHot: true  },
      { id: 15, name: '柠檬水',       price: '18', category: 'other',    categoryLabel: '无咖啡因饮品', saleStatus: 'on', image: '/assets/CodeBubbyAssets/4_745/45.svg', spec: '', supportIceHot: true  },
      { id: 16, name: '鲜榨橙汁',     price: '25', category: 'other',    categoryLabel: '无咖啡因饮品', saleStatus: 'on', image: '/assets/CodeBubbyAssets/4_745/48.svg', spec: '', supportIceHot: false }
    ],
    filteredProducts: [],

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
      supportIceHot: false,
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
    _heroFileIDs: []
  },

  onLoad() {
    this.loadHomeSettings();
    this._applyProductFilter('all');
    this._applyOrderFilter('all');
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  // ===== 商品管理 =====
  _applyProductFilter(category) {
    const products = this.data.products;
    const filtered = category === 'all'
      ? products
      : products.filter(p => p.category === category);
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
        supportIceHot: false,
        imagePreview: ''
      }
    });
  },

  onEditProduct(e) {
    const id = e.currentTarget.dataset.id;
    const product = this.data.products.find(p => p.id === id);
    if (!product) return;
    const categoryOptions = this.data.categoryOptions;
    const categoryIndex = categoryOptions.findIndex(c => c.value === product.category);
    this.setData({
      showProductModal: true,
      editingProduct: {
        id: product.id,
        name: product.name,
        price: product.price,
        category: product.category,
        categoryLabel: product.categoryLabel,
        categoryIndex: categoryIndex >= 0 ? categoryIndex : 0,
        saleStatus: product.saleStatus,
        spec: product.spec || '',
        supportIceHot: product.supportIceHot || false,
        imagePreview: product.image || ''
      }
    });
  },

  onCloseProductModal() {
    this.setData({ showProductModal: false });
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this.setData({ 'editingProduct.imagePreview': path });
      }
    });
  },

  onInputProductName(e) {
    this.setData({ 'editingProduct.name': e.detail.value });
  },

  onPickerCategory(e) {
    const index = parseInt(e.detail.value);
    const option = this.data.categoryOptions[index];
    this.setData({
      'editingProduct.categoryIndex': index,
      'editingProduct.category': option.value,
      'editingProduct.categoryLabel': option.label
    });
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

  onToggleIceHot() {
    this.setData({ 'editingProduct.supportIceHot': !this.data.editingProduct.supportIceHot });
  },

  onSaveProduct() {
    const ep = this.data.editingProduct;
    if (!ep.name) {
      wx.showToast({ title: '请输入商品名称', icon: 'none' });
      return;
    }
    if (!ep.price) {
      wx.showToast({ title: '请输入价格', icon: 'none' });
      return;
    }
    const products = this.data.products.slice();
    if (ep.id) {
      const idx = products.findIndex(p => p.id === ep.id);
      if (idx >= 0) {
        products[idx] = {
          ...products[idx],
          name: ep.name,
          price: ep.price,
          category: ep.category,
          categoryLabel: ep.categoryLabel,
          saleStatus: ep.saleStatus,
          spec: ep.spec,
          supportIceHot: ep.supportIceHot,
          image: ep.imagePreview || products[idx].image
        };
      }
    } else {
      const newId = Date.now();
      products.push({
        id: newId,
        name: ep.name,
        price: ep.price,
        category: ep.category,
        categoryLabel: ep.categoryLabel,
        saleStatus: ep.saleStatus,
        spec: ep.spec,
        supportIceHot: ep.supportIceHot,
        image: ep.imagePreview || ''
      });
    }
    this.setData({ products, showProductModal: false });
    this._applyProductFilter(this.data.activeCategoryFilter);
    wx.showToast({ title: '保存成功', icon: 'success' });
  },

  onDeleteProduct(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，是否继续？',
      success: (res) => {
        if (res.confirm) {
          const products = this.data.products.filter(p => p.id !== id);
          this.setData({ products });
          this._applyProductFilter(this.data.activeCategoryFilter);
          wx.showToast({ title: '已删除', icon: 'success' });
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
      this.setData({ heroImages: [], _heroFileIDs: [] });
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
  // heroImages：显示用（本地临时路径 或 https 临时链接）
  // _heroFileIDs：与 heroImages 一一对应的云存储 fileID（未上传的位置为 null）

  onAddHeroImage() {
    if (this.data.heroImages.length >= 3) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        const images = this.data.heroImages.concat([path]);
        const fileIDs = this.data._heroFileIDs.concat([null]); // 新图尚未上传，fileID 为 null
        this.setData({ heroImages: images, _heroFileIDs: fileIDs });
      }
    });
  },

  onReplaceHeroImage(e) {
    const index = e.currentTarget.dataset.index;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        const images = this.data.heroImages.slice();
        const fileIDs = this.data._heroFileIDs.slice();
        images[index] = path;
        fileIDs[index] = null; // 新图尚未上传
        this.setData({ heroImages: images, _heroFileIDs: fileIDs });
      }
    });
  },

  onDeleteHeroImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.heroImages.slice();
    const fileIDs = this.data._heroFileIDs.slice();
    images.splice(index, 1);
    fileIDs.splice(index, 1);
    this.setData({ heroImages: images, _heroFileIDs: fileIDs });
  },

  /**
   * 保存：
   * 1. 遍历 heroImages，fileID 为 null 的说明是新选的本地临时图片，上传到云存储
   * 2. 将所有 fileID 写入云数据库 heroImages/config
   * 3. 重新获取临时链接刷新显示
   */
  async onSaveHeroImages() {
    const { heroImages, _heroFileIDs } = this.data;
    if (heroImages.length === 0) {
      // 清空：直接写空数组到云数据库
      wx.showLoading({ title: '保存中...', mask: true });
      try {
        const db = wx.cloud.database();
        try {
          await db.collection('heroImages').doc('config').set({ data: { images: [] } });
        } catch (dbErr) {
          await db.collection('heroImages').add({ data: { _id: 'config', images: [] } });
        }
        this.setData({ heroImages: [], _heroFileIDs: [] });
        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
      } catch (e) {
        wx.hideLoading();
        console.error('[Hero] 清空失败', e);
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
      return;
    }

    wx.showLoading({ title: '上传中...', mask: true });
    try {
      // 逐张上传，fileID 不为 null 的跳过
      const finalFileIDs = [];
      for (let i = 0; i < heroImages.length; i++) {
        const src = heroImages[i];
        const existingID = _heroFileIDs[i];
        if (existingID) {
          finalFileIDs.push(existingID);
          continue;
        }
        // 本地临时路径，上传到云存储
        const rawExt = src.split('?')[0].split('.').pop() || '';
        const ext = rawExt.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'jpg';
        const cloudPath = `heroImages/${Date.now()}_${i}.${ext}`;
        console.log(`[Hero] 上传第${i + 1}张，src=${src}, cloudPath=${cloudPath}`);
        const uploadRes = await new Promise((resolve, reject) => {
          wx.cloud.uploadFile({
            cloudPath,
            filePath: src,
            success: resolve,
            fail: (err) => {
              console.error(`[Hero] uploadFile 失败，index=${i}`, err);
              reject(err);
            }
          });
        });
        finalFileIDs.push(uploadRes.fileID);
        console.log(`[Hero] 第${i + 1}张上传成功，fileID=${uploadRes.fileID}`);
      }

      // 写入云数据库（集合不存在时用 add 自动创建）
      const db = wx.cloud.database();
      try {
        await db.collection('heroImages').doc('config').set({ data: { images: finalFileIDs } });
      } catch (dbErr) {
        // 集合不存在（-502005）或文档不存在，改用 add 创建
        console.warn('[Hero] set 失败，尝试 add', dbErr);
        await db.collection('heroImages').add({ data: { _id: 'config', images: finalFileIDs } });
      }
      console.log('[Hero] 云数据库写入成功', finalFileIDs);

      // 获取临时链接刷新显示
      const urlRes = await wx.cloud.getTempFileURL({ fileList: finalFileIDs });
      const displayUrls = urlRes.fileList.map(f => f.tempFileURL);

      this.setData({ heroImages: displayUrls, _heroFileIDs: finalFileIDs });
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      console.error('[Hero] onSaveHeroImages 失败', e);
      wx.showToast({ title: `上传失败: ${e.errMsg || e.message || '未知错误'}`, icon: 'none', duration: 3000 });
    }
  },

  onCancelHeroImages() {
    // 取消：重新从云端加载，丢弃本地未保存的修改
    this._loadHeroImagesFromCloud();
  },

  onReady() {},
  onShow() {},
  onHide() {},
  onUnload() {},
  onPullDownRefresh() {},
  onReachBottom() {},
  onShareAppMessage() {}
})
