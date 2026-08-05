// pages/admin/admin.js
const SUBSCRIBE = require('../../config/subscribe.js');

// 本地缓存工具
function cacheGet(key) {
  try { const r = wx.getStorageSync('_admin_' + key); if (r && r.t && Date.now() - r.t < r.ttl) return r.d; } catch (e) {}
  return null;
}
function cacheSet(key, data, ttl) {
  try { wx.setStorageSync('_admin_' + key, { t: Date.now(), ttl, d: data }); } catch (e) {}
}

Page({

  data: {
    activeTab: 'stats',

    // ===== 数据统计 =====
    statsPeriod: 'day',   // day / week / month
    todaySales: 0,
    orderCount: 0,
    avgOrderValue: 0,
    productRanking: [],

    // ===== 商品管理 =====
    activeCategoryFilter: 'all',
    categoryFilters: [
      { value: 'all',    label: '全部',        count: 0 },
      { value: 'coco',   label: '可可',        count: 0 },
      { value: 'coffee', label: '咖啡',        count: 0 },
      { value: 'icecream', label: '冰淇淋',    count: 0 },
      { value: 'dessert',  label: '甜点',      count: 0 },
      { value: 'other',  label: '无咖啡因饮品', count: 0 }
    ],
    activeStatusFilter: 'all',
    statusFilters: [
      { value: 'all', label: '全部' },
      { value: 'on',  label: '上架' },
      { value: 'off', label: '下架' },
      { value: 'sold', label: '售罄' }
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
      imagePreview: '',
      // 新增咖啡相关字段
      roastLevel: '',           // 烘焙度
      roastLevelIndex: 0,       // 烘焙度选择器索引
      customRoast: '',          // 自定义烘焙度
      processingMethod: '',     // 处理法
      processingMethodIndex: 0, // 处理法选择器索引
      customProcessing: ''      // 自定义处理法
    },
    categoryOptions: [
      { value: 'coco',     label: '可可' },
      { value: 'coffee',   label: '咖啡' },
      { value: 'icecream', label: '冰淇淋' },
      { value: 'dessert',  label: '甜点' },
      { value: 'other',    label: '无咖啡因饮品' }
    ],
    // 烘焙度选项
    roastLevelOptions: [
      '浅烘焙',
      '中浅烘焙',
      '中烘焙',
      '中深烘焙',
      '深烘焙',
      '极深烘焙'
    ],
    // 处理法选项
    processingMethodOptions: [
      '日晒',
      '水洗',
      '蜜处理',
      '湿刨'
    ],

    // 快速编辑弹窗
    showQuickRoastModal: false,
    showQuickProcessingModal: false,
    showQuickStatusModal: false,
    quickEditingProductId: null,
    quickEditingRoast: '',
    quickEditingProcessing: '',
    quickEditingStatus: '',

    // ===== 订单管理 =====
    activeOrderFilter: 'all',
    orderFilters: [
      { value: 'all',      label: '全部',     count: 0 },
      { value: 'making',   label: '制作中',   count: 0 },
      { value: 'done',     label: '已完成',   count: 0 },
      { value: 'refunded', label: '已退款',   count: 0 }
    ],
    orders: [],
    filteredOrders: [],

    // ===== 首页内容 =====
    wifiName: '',
    wifiPassword: '',
    _wifiNameSaved: '',
    _wifiPasswordSaved: '',
    // 打烊
    shopClosed: false,
    openingTime: '',
    closingTime: '',
    closedTitle: '',
    closedMessage: '',
    // 长期打烊日期选择
    showCloseDatePicker: false,
    closeUntilDate: '',
    _bizHoursSaved: {},

    // 英雄区轮播图（heroImages 为显示用临时 URL，_heroFileIDs 为云存储 fileID）
    heroImages: [],
    _heroFileIDs: [],
    _heroModified: false,  // 是否有未保存的修改，true 时 onShow 不刷新

    // 首页商品展示
    featuredItems: [],
    _featuredFileIDs: [],
    _featuredModified: false,
    // 拖拽排序状态
    _dragTimer: null,        // 长按计时器
    _dragTargetIndex: -1,    // 被拖拽项的索引
    _dragActive: false,      // 拖拽是否已激活
    _dragStartX: 0,          // 起始触摸X
    _dragStartY: 0,          // 起始触摸Y
    _draggingIndex: -1,      // 当前拖拽中项的索引（用于UI高亮）
    _dragOffsetX: 0,         // X偏移
    _dragOffsetY: 0,         // Y偏移
    _dragItemW: 0,           // 单项宽度（px）
    _dragItemH: 0,           // 单项高度（px）
    _dragItemsPerRow: 3,     // 每行列数
    // 滚动位置追踪
    _lockedScrollTop: 0,
    _realScrollTop: 0,
    // 商品卡片拖拽排序
    _prodDragTimer: null,
    _prodDragTarget: -1,
    _prodDragActive: false,
    _prodDragStartY: 0,
    _prodDragIdx: -1,
    _prodDragOffY: 0,
    _prodDragItemH: 120,  // 估算单项高度(px)
    // 商品选择弹窗
    showFeaturedPicker: false,
    featuredPickerProducts: [],

    // 分享配置
    shareConfig: {
      shareTitle: '',
      timelineTitle: '',
      shareImage: '',
      timelineImage: '',
      path: ''
    },
    _shareConfig: {},  // 保存 fileID，用于云端存储
    _shareConfigSaved: {},  // 保存的配置，用于取消时恢复

    // ===== 桌面点单二维码 =====
    tables: [],
    _tablesLoaded: false,
    showTableModal: false,
    editingTable: { id: null, name: '', enabled: true },
    tableQRLoading: '',  // 正在生成 QR 的 table _id
  },

  onLoad() {
    this._initCloudDB();
  },

  onReady() {
    // 页面渲染完成后加载数据，确保云初始化完成
    this.loadHomeSettings();
    this._loadProductsFromCloud();
    this._loadOrdersFromCloud();
    this._applyOrderFilter('all');
    this._loadStatisticsFromCloud();
    this._loadFeaturedProducts();
    this._loadTablesFromCloud();
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
    const newTab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: newTab });
    if (newTab === 'stats') {
      this._loadStatisticsFromCloud(this.data.statsPeriod);
    }
  },

  onStatsPeriod(e) {
    const period = e.currentTarget.dataset.period;
    this.setData({ statsPeriod: period });
    this._loadStatisticsFromCloud(period);
  },

  // ===== 商品管理 =====

  // 从云数据库加载商品列表
  async _loadProductsFromCloud() {
    const cached = cacheGet('products');
    if (cached) {
      this.setData({ products: cached, productsLoading: false });
      this._refreshCategoryFilters(cached);
      this._applyProductFilter(this.data.activeCategoryFilter, cached);
      return;
    }
    this.setData({ productsLoading: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'initDB', data: { action: 'getProducts' } });
      const products = (res.result && res.result.data) || [];
      this.setData({ products, productsLoading: false });
      cacheSet('products', products, 15 * 60 * 1000);
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
    let filtered = category === 'all' ? list : list.filter(p => p.category === category);
    // 叠加状态筛选
    const status = this.data.activeStatusFilter;
    if (status !== 'all') {
      filtered = filtered.filter(p => p.saleStatus === status);
    }
    this.setData({ filteredProducts: filtered, activeCategoryFilter: category });
    this._refreshStatusFilters(category);
  },

  onCategoryFilter(e) {
    this._applyProductFilter(e.currentTarget.dataset.value);
  },

  onStatusFilter(e) {
    const status = e.currentTarget.dataset.value;
    this.setData({ activeStatusFilter: status });
    this._applyProductFilter(this.data.activeCategoryFilter);
  },

  _refreshStatusFilters(category) {
    const list = this.data.products;
    const baseList = category === 'all' ? list : list.filter(p => p.category === category);
    const filters = [
      { value: 'all', label: '全部', count: baseList.length },
      { value: 'on',  label: '上架', count: baseList.filter(p => p.saleStatus === 'on').length },
      { value: 'off',  label: '下架', count: baseList.filter(p => p.saleStatus === 'off').length },
      { value: 'sold', label: '售罄', count: baseList.filter(p => p.saleStatus === 'sold').length },
    ];
    this.setData({ statusFilters: filters });
  },

  onRefreshProducts() {
    // 清除缓存，强制从云端加载
    try { wx.removeStorageSync('_admin_products'); } catch (e) {}
    this._loadProductsFromCloud();
    wx.showToast({ title: '已刷新', icon: 'success', duration: 1000 });
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
        imageFileID: '',
        // 咖啡类商品：初始化烘焙度和处理法
        roastLevel: '',
        roastLevelIndex: 0,
        customRoast: '',
        processingMethod: '',
        processingMethodIndex: 0,
        customProcessing: ''
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

    // 咖啡类商品：加载烘焙度和处理法
    const roastLevel = product.roastLevel || '';
    const roastLevelIndex = this.data.roastLevelOptions.indexOf(roastLevel) >= 0
      ? this.data.roastLevelOptions.indexOf(roastLevel)
      : -1;
    const customRoast = this.data.roastLevelOptions.includes(roastLevel) ? '' : roastLevel;

    const processingMethod = product.processingMethod || '';
    const processingMethodIndex = this.data.processingMethodOptions.indexOf(processingMethod) >= 0
      ? this.data.processingMethodOptions.indexOf(processingMethod)
      : -1;
    const customProcessing = this.data.processingMethodOptions.includes(processingMethod) ? '' : processingMethod;

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
        imageFileID: product.imageFileID || '',
        // 咖啡类商品：加载烘焙度和处理法
        roastLevel: roastLevel,
        roastLevelIndex: roastLevelIndex,
        customRoast: customRoast,
        processingMethod: processingMethod,
        processingMethodIndex: processingMethodIndex,
        customProcessing: customProcessing
      }
    });
  },

  onCloseProductModal() {
    this.setData({ showProductModal: false });
  },

  // ===== 快速编辑商品状态 =====

  // 点击状态标签
  onQuickEditStatus(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    this.setData({
      showQuickStatusModal: true,
      quickEditingProductId: id,
      quickEditingStatus: status
    });
  },

  // 关闭状态弹窗
  onCloseQuickStatusModal() {
    this.setData({
      showQuickStatusModal: false,
      quickEditingProductId: null,
      quickEditingStatus: ''
    });
  },

  // 选择状态选项
  onSelectQuickStatus(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      quickEditingStatus: status
    });
  },

  // 保存状态
  onSaveQuickStatus() {
    const { quickEditingProductId, quickEditingStatus } = this.data;
    if (!quickEditingProductId || !quickEditingStatus) {
      wx.showToast({ title: '请选择状态', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '更新中...', mask: true });
    try {
      wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'updateProduct', id: quickEditingProductId, product: { saleStatus: quickEditingStatus } }
      }).then(() => {
        wx.hideLoading();
        // 更新本地数据
        const products = this.data.products.map(p => {
          if (p._id === quickEditingProductId) {
            return { ...p, saleStatus: quickEditingStatus };
          }
          return p;
        });
        this.setData({ products });
        this._applyProductFilter(this.data.activeCategoryFilter, products);
        this.onCloseQuickStatusModal();
        wx.showToast({ title: '状态已更新', icon: 'success' });
      }).catch(err => {
        wx.hideLoading();
        wx.showToast({ title: '更新失败', icon: 'none' });
        console.error('[Products] 状态更新失败', err);
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'none' });
      console.error('[Products] 状态更新失败', e);
    }
  },

  // ===== 快速编辑烘焙度和处理法 =====

  // 点击烘焙度标签
  onQuickEditRoast(e) {
    const id = e.currentTarget.dataset.id;
    const roast = e.currentTarget.dataset.roast;
    this.setData({
      showQuickRoastModal: true,
      quickEditingProductId: id,
      quickEditingRoast: roast
    });
  },

  // 关闭烘焙度弹窗
  onCloseQuickRoastModal() {
    this.setData({
      showQuickRoastModal: false,
      quickEditingProductId: null,
      quickEditingRoast: ''
    });
  },

  // 选择烘焙度选项
  onSelectQuickRoast(e) {
    const roast = e.currentTarget.dataset.roast;
    this.setData({
      quickEditingRoast: roast
    });
  },

  // 保存烘焙度
  onSaveQuickRoast() {
    const { quickEditingProductId, quickEditingRoast } = this.data;
    if (!quickEditingProductId || !quickEditingRoast) {
      wx.showToast({ title: '请选择烘焙度', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '更新中...', mask: true });
    try {
      wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'updateProduct', id: quickEditingProductId, product: { roastLevel: quickEditingRoast } }
      }).then(() => {
        wx.hideLoading();
        // 更新本地数据
        const products = this.data.products.map(p => {
          if (p._id === quickEditingProductId) {
            return { ...p, roastLevel: quickEditingRoast };
          }
          return p;
        });
        this.setData({ products });
        this._applyProductFilter(this.data.activeCategoryFilter, products);
        this.onCloseQuickRoastModal();
        wx.showToast({ title: '烘焙度已更新', icon: 'success' });
      }).catch(err => {
        wx.hideLoading();
        wx.showToast({ title: '更新失败', icon: 'none' });
        console.error('[Products] 烘焙度更新失败', err);
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'none' });
      console.error('[Products] 烘焙度更新失败', e);
    }
  },

  // 点击处理法标签
  onQuickEditProcessing(e) {
    const id = e.currentTarget.dataset.id;
    const processing = e.currentTarget.dataset.processing;
    this.setData({
      showQuickProcessingModal: true,
      quickEditingProductId: id,
      quickEditingProcessing: processing
    });
  },

  // 关闭处理法弹窗
  onCloseQuickProcessingModal() {
    this.setData({
      showQuickProcessingModal: false,
      quickEditingProductId: null,
      quickEditingProcessing: ''
    });
  },

  // 选择处理法选项
  onSelectQuickProcessing(e) {
    const processing = e.currentTarget.dataset.processing;
    this.setData({
      quickEditingProcessing: processing
    });
  },

  // 保存处理法
  onSaveQuickProcessing() {
    const { quickEditingProductId, quickEditingProcessing } = this.data;
    if (!quickEditingProductId || !quickEditingProcessing) {
      wx.showToast({ title: '请选择处理法', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '更新中...', mask: true });
    try {
      wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'updateProduct', id: quickEditingProductId, product: { processingMethod: quickEditingProcessing } }
      }).then(() => {
        wx.hideLoading();
        // 更新本地数据
        const products = this.data.products.map(p => {
          if (p._id === quickEditingProductId) {
            return { ...p, processingMethod: quickEditingProcessing };
          }
          return p;
        });
        this.setData({ products });
        this._applyProductFilter(this.data.activeCategoryFilter, products);
        this.onCloseQuickProcessingModal();
        wx.showToast({ title: '处理法已更新', icon: 'success' });
      }).catch(err => {
        wx.hideLoading();
        wx.showToast({ title: '更新失败', icon: 'none' });
        console.error('[Products] 处理法更新失败', err);
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'none' });
      console.error('[Products] 处理法更新失败', e);
    }
  },

  // ===== 咖啡类商品专属方法 =====

  // 选择烘焙度
  onPickerRoastLevel(e) {
    const index = e.detail.value;
    const roastLevel = this.data.roastLevelOptions[index];
    this.setData({
      'editingProduct.roastLevel': roastLevel,
      'editingProduct.roastLevelIndex': index,
      'editingProduct.customRoast': '' // 清空自定义值
    });
  },

  // 输入自定义烘焙度
  onInputCustomRoast(e) {
    this.setData({
      'editingProduct.customRoast': e.detail.value
    });
  },

  // 自定义烘焙度失去焦点（优先使用自定义值）
  onBlurCustomRoast(e) {
    const customRoast = e.detail.value.trim();
    if (customRoast) {
      this.setData({
        'editingProduct.roastLevel': customRoast,
        'editingProduct.roastLevelIndex': -1 // -1 表示自定义
      });
    }
  },

  // 选择处理法
  onPickerProcessingMethod(e) {
    const index = e.detail.value;
    const processingMethod = this.data.processingMethodOptions[index];
    this.setData({
      'editingProduct.processingMethod': processingMethod,
      'editingProduct.processingMethodIndex': index,
      'editingProduct.customProcessing': '' // 清空自定义值
    });
  },

  // 输入自定义处理法
  onInputCustomProcessing(e) {
    this.setData({
      'editingProduct.customProcessing': e.detail.value
    });
  },

  // 自定义处理法失去焦点（优先使用自定义值）
  onBlurCustomProcessing(e) {
    const customProcessing = e.detail.value.trim();
    if (customProcessing) {
      this.setData({
        'editingProduct.processingMethod': customProcessing,
        'editingProduct.processingMethodIndex': -1 // -1 表示自定义
      });
    }
  },

  // 选择商品图片并立即上传到云存储
  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      fail: (err) => {
        console.error('[Products] chooseMedia 失败:', err);
        wx.showToast({ title: err.errMsg || '选择图片失败', icon: 'none' });
      },
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

    // 咖啡类商品：保存烘焙度和处理法
    if (ep.category === 'coffee') {
      if (ep.roastLevel) {
        productData.roastLevel = ep.roastLevel;
      }
      if (ep.processingMethod) {
        productData.processingMethod = ep.processingMethod;
      }
    }

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
      try { wx.removeStorageSync('_admin_products'); } catch (e) {}
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
            try { wx.removeStorageSync('_admin_products'); } catch (e) {}
            this._loadProductsFromCloud();
          } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // ===== 数据统计 =====

  /**
   * 从云数据库加载统计数据
   * 包括：今日销售额、订单量、客单价、商品销售排行
   */
  async _loadStatisticsFromCloud(period) {
    if (!period) period = this.data.statsPeriod || 'day';
    const cacheKey = 'stats_' + period;
    const cached = cacheGet(cacheKey);
    if (cached) { this.setData(cached); return; }
    try {
      const db = wx.cloud.database();
      const now = new Date();

      // 计算统计周期的起始时间（new Date 按本地时区，传至 DB 自动转 UTC）
      let startDate;
      if (period === 'week') {
        const dayOfWeek = now.getDay();
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startDate.setDate(startDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }

      // 查询周期内订单（排除已退款的）
      const periodRes = await db.collection('orders')
        .where({
          createTime: db.command.gte(startDate),
          status: db.command.neq('refunded')
        })
        .get();

      const periodOrders = periodRes.data || [];

      // 销售额
      let totalSales = 0;
      periodOrders.forEach(order => { totalSales += order.totalAmount || 0; });

      // 商品销售排行（基于周期内订单）
      const productStats = {};
      periodOrders.forEach(order => {
        const products = order.products || [];
        products.forEach(product => {
          const name = product.name || '未知商品';
          const quantity = product.quantity || 1;
          const price = product.price || 0;
          const revenue = price * quantity;

          if (!productStats[name]) {
            productStats[name] = { sales: 0, revenue: 0 };
          }
          productStats[name].sales += quantity;
          productStats[name].revenue += revenue;
        });
      });

      // 转换为数组并排序（按销量降序）
      const rankingList = Object.entries(productStats)
        .map(([name, stats], index) => ({
          rank: index + 1,
          name,
          sales: stats.sales,
          revenue: Math.round(stats.revenue * 100) / 100 // 保留两位小数
        }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 5); // 只取前 5 名

      // 重新设置排名（因为排序后 rank 可能不连续）
      rankingList.forEach((item, index) => {
        item.rank = index + 1;
      });

      // 客单价
      const avgOrderValue = periodOrders.length > 0
        ? Math.round((totalSales / periodOrders.length) * 100) / 100 : 0;

      // 更新数据
      const statsData = {
        todaySales: Math.round(totalSales * 100) / 100,
        orderCount: periodOrders.length,
        avgOrderValue,
        productRanking: rankingList
      };
      this.setData(statsData);
      cacheSet(cacheKey, statsData, 2 * 60 * 1000);

      console.log('[Statistics] 加载成功', {
        todaySales: this.data.todaySales,
        orderCount: this.data.orderCount,
        avgOrderValue: this.data.avgOrderValue,
        productRanking: this.data.productRanking
      });
    } catch (e) {
      console.error('[Statistics] 加载失败', e);
      wx.showToast({ title: '统计数据加载失败', icon: 'none' });
    }
  },

  // ===== 订单管理 =====

  // 从云数据库加载订单列表
  async _loadOrdersFromCloud() {
    try {
      const db = wx.cloud.database();
      // 仅显示14天内的订单
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const res = await db.collection('orders')
        .where({ createTime: db.command.gte(twoWeeksAgo) })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();

      // 转换云数据库订单数据格式
      const orders = res.data.map(order => {
        const createTime = order.createTime || {};
        const timeStr = createTime.$date
          ? new Date(createTime.$date).toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            }).replace(/\//g, '-')
          : '';

        return {
          id: order._id || order.id || '',
          _id: order._id,
          status: order.status || 'making',
          pickupNo: order.pickupNumber || '',
          type: order.orderType === 'dine-in' ? 'dine' : 'takeaway',
          userName: '微信用户',
          time: timeStr,
          items: (order.products || []).map(p => ({
            name: p.name || '',
            temp: p.temperature === '冰' ? '冰' : p.temperature === '热' ? '热' : '',
            qty: p.quantity || 1,
            price: p.price || 0
          })),
          total: order.totalAmount || 0,
          remark: order.remark || '',
          // 保留支付相关字段用于退款
          orderId: order.orderId,
          outTradeNo: order.outTradeNo,
          transactionId: order.transactionId,
          totalAmount: order.totalAmount
        };
      });

      // 更新订单筛选器数量
      const orderFilters = this.data.orderFilters.map(f => {
        if (f.value === 'all') return { ...f, count: orders.length };
        return { ...f, count: orders.filter(o => o.status === f.value).length };
      });

      this.setData({ orders, orderFilters });
      this._applyOrderFilter(this.data.activeOrderFilter);
    } catch (e) {
      console.warn('[Orders] 加载失败', e);
    }
  },

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

    // 从当前订单列表中找到该订单
    const order = this.data.orders.find(o => o._id === id);
    if (!order) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      return;
    }

    // 检查订单状态
    if (order.status === 'refunded') {
      wx.showToast({ title: '该订单已退款', icon: 'none' });
      return;
    }

    // 检查是否有关联订单（堂食+外带）
    const hasRelatedOrder = this.data.orders.some(o =>
      o._id !== id && o.outTradeNo === order.outTradeNo
    );

    // 构造确认提示内容
    let confirmContent = `退款后订单状态将变为"已退款"，退款金额为 ¥${(order.totalAmount || order.total || 0).toFixed(2)}，是否继续？`;
    if (hasRelatedOrder) {
      confirmContent = `此订单与另一订单共享同一笔支付（总金额 ¥${(order.totalAmount || order.total || 0).toFixed(2)}），将发起部分退款，是否继续？`;
    }

    wx.showModal({
      title: '确认退款',
      content: confirmContent,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...', mask: true });
          try {
            // 调用退款云函数
            const result = await wx.cloud.callFunction({
              name: 'refundPayment',
              data: {
                orderId: order._id,
                outTradeNo: order.outTradeNo,
                transactionId: order.transactionId,
                refundAmount: order.totalAmount || order.total || 0
              }
            });

            wx.hideLoading();

            // 根据返回结果显示不同提示
            if (result.result && result.result.alreadyRefunded) {
              wx.showToast({ title: '订单已退款', icon: 'success' });
            } else if (result.result && result.result.isPartialRefund) {
              wx.showToast({
                title: '部分退款成功',
                icon: 'success',
                duration: 2000
              });
            } else {
              wx.showToast({ title: '退款成功', icon: 'success' });
            }

            // 刷新订单列表
            this._loadOrdersFromCloud();
          } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '操作失败', icon: 'none' });
            console.error('[Orders] 退款失败', e);
          }
        }
      }
    });
  },

  // 更新订单状态
  async updateOrderStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const statusText = status === 'making' ? '制作中' : status === 'ready' ? '待取餐' : '已完成';

    wx.showModal({
      title: '确认操作',
      content: `确认将订单状态更改为"${statusText}"?`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...', mask: true });
          try {
            const db = wx.cloud.database();
            await db.collection('orders').doc(id).update({
              data: { status }
            });
            wx.hideLoading();
            wx.showToast({ title: '更新成功', icon: 'success' });
            this._loadOrdersFromCloud();
          } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '操作失败', icon: 'none' });
            console.error('[Orders] 更新状态失败', e);
          }
        }
      }
    });
  },

  // ===== 首页内容 =====
  loadHomeSettings() {
    // 加载英雄区轮播图（从云数据库读取，转换 fileID 为临时链接）
    this._loadHeroImagesFromCloud();
    // 从云数据库加载 Wi-Fi 设置
    this._loadWifiSettingsFromCloud();
    // 加载分享配置
    this._loadShareConfigFromCloud();
  },

  /**
   * 从云数据库加载 Wi-Fi 设置
   */
  async _loadWifiSettingsFromCloud() {
    const cached = cacheGet('wifi');
    if (cached) { this.setData(cached); return; }
    console.log('[WiFi] 开始从云端加载 Wi-Fi 设置');
    try {
      const db = wx.cloud.database();
      const res = await db.collection('homeSettings').doc('config').get();
      const data = res.data || {};
      console.log('[WiFi] 云端数据:', data);
      const wifiData = {
        wifiName: data.wifiName || '',
        wifiPassword: data.wifiPassword || '',
        _wifiNameSaved: data.wifiName || '',
        _wifiPasswordSaved: data.wifiPassword || '',
        openingTime: data.openingTime || '',
        closingTime: data.closingTime || '',
        closedTitle: data.closedTitle || '',
        closedMessage: data.closedMessage || '',
        manualClosed: data.manualClosed,
        manualClosedDate: data.manualClosedDate || '',
        manualClosedUntil: data.manualClosedUntil || '',
        _bizHoursSaved: { openingTime: data.openingTime || '', closingTime: data.closingTime || '', closedTitle: data.closedTitle || '', closedMessage: data.closedMessage || '' }
      };
      this.setData(wifiData);
      this._checkShopClosed();
      cacheSet('wifi', wifiData, 5 * 60 * 1000);
      console.log('[WiFi] 加载完成，wifiName:', data.wifiName, 'wifiPassword:', data.wifiPassword);
    } catch (e) {
      console.error('[WiFi] 从云端加载失败', e);
      // 云端加载失败或文档不存在时，尝试从本地加载（首次使用时文档不存在是正常的）
      if (e.errMsg && e.errMsg.includes('cannot find document')) {
        // 文档不存在是正常的首次使用情况，不显示警告
        console.log('[WiFi] 云端无配置文档，首次使用');
      } else {
        console.warn('[WiFi] 从云端加载失败，尝试本地存储', e);
      }
      try {
        const saved = wx.getStorageSync('homeSettings');
        if (saved) {
          this.setData({
            wifiName: saved.wifiName || '',
            wifiPassword: saved.wifiPassword || '',
            _wifiNameSaved: saved.wifiName || '',
            _wifiPasswordSaved: saved.wifiPassword || ''
          });
          console.log('[WiFi] 从本地加载成功');
        }
      } catch (localErr) {
        console.warn('[WiFi] 从本地加载也失败', localErr);
      }
    }
  },

  /**
   * 从云数据库加载英雄区 fileID，并转换为可显示的 https 临时链接
   * _heroFileIDs 保存原始 fileID，heroImages 保存显示用临时链接
   */
  async _loadHeroImagesFromCloud() {
    // 缓存命中直接返回
    const cached = cacheGet('hero');
    if (cached) {
      this.setData({ heroImages: cached.urls, _heroFileIDs: cached.ids.slice() });
      return;
    }
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
      cacheSet('hero', { urls, ids: fileIDs.slice() }, 10 * 60 * 1000);
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

    // 保存到云数据库，以便其他设备同步
    wx.cloud.callFunction({
      name: 'initDB',
      data: {
        action: 'setHomeSettings',
        wifiName,
        wifiPassword
      }
    }).then(() => {
      // 同时保存到本地存储
      wx.setStorageSync('homeSettings', { wifiName, wifiPassword });
      this.setData({
        _wifiNameSaved: wifiName,
        _wifiPasswordSaved: wifiPassword
      });
      wx.removeStorageSync('_admin_wifi');  // 失效缓存
      wx.showToast({ title: '保存成功', icon: 'success' });
    }).catch(e => {
      console.error('[Admin] 保存 Wi-Fi 设置失败', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  onCancelHomeSettings() {
    this.setData({
      wifiName: this.data._wifiNameSaved,
      wifiPassword: this.data._wifiPasswordSaved
    });
  },

  // ===== 打烊开关 =====
  async onToggleClosed() {
    const newState = !this.data.shopClosed;
    if (newState) {
      wx.showActionSheet({
        itemList: ['仅今日', '选日期'],
        success: async (r) => {
          console.log('[Admin] actionSheet tapIndex:', r.tapIndex);
          if (r.tapIndex === 0) await this._doClose(true);
          else if (r.tapIndex === 1) this._pickCloseDate();
        },
        fail: (e) => { console.error('[Admin] actionSheet fail:', e); }
      });
    } else {
      // 恢复营业
      await this._doClose(false);
    }
  },

  _pickCloseDate() {
    console.log('[Admin] _pickCloseDate 被调用');
    const d = new Date();
    // actionSheet 关闭动画会阻塞 setData 渲染，延迟300ms打开
    setTimeout(() => {
      this.setData({
        showCloseDatePicker: true,
        closeUntilDate: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
        closeUntilDate: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      });
    }, 300);
  },

  onCloseDateChange(e) { this.setData({ closeUntilDate: e.detail.value }); },
  onCancelCloseDate() { this.setData({ showCloseDatePicker: false }); },

  async onConfirmCloseDate() {
    const { closeUntilDate, openingTime } = this.data;
    this.setData({ showCloseDatePicker: false });
    await this._doClose(true, `${closeUntilDate}T${openingTime || '09:30'}`);
  },

  async _doClose(closed, untilDate) {
    this.setData({ shopClosed: closed, manualClosed: closed ? true : false });
    wx.removeStorageSync('_admin_wifi');
    try {
      const data = { action: 'toggleClosed', manualClosed: closed ? true : false };
      if (untilDate) data.manualClosedUntil = untilDate;
      await wx.cloud.callFunction({ name: 'initDB', data });
      wx.showToast({ title: closed ? '已打烊' : '已营业', icon: 'success' });
    } catch (e) {
      this.setData({ shopClosed: !closed, manualClosed: closed ? false : true });
    }
  },

  _checkShopClosed() {
    const { openingTime, closingTime, manualClosed, manualClosedDate, manualClosedUntil } = this.data;
    let effective = manualClosed;
    const today = new Date().toISOString().slice(0, 10);
    if (manualClosed !== undefined && manualClosed !== null) {
      let expired = false;
      if (manualClosedUntil) expired = new Date() >= new Date(manualClosedUntil);
      else if (manualClosedDate && manualClosedDate < today && openingTime) {
        const h = new Date().getHours()*60+new Date().getMinutes();
        const o = parseInt(openingTime.split(':')[0])*60+parseInt(openingTime.split(':')[1]||0);
        expired = h >= o;
      }
      if (expired) effective = undefined;
    }
    if (effective === true) { this.setData({ shopClosed: true }); return; }
    if (effective === false) { this.setData({ shopClosed: false }); return; }
    if (!openingTime || !closingTime) { this.setData({ shopClosed: false }); return; }
    const now = new Date();
    const hm = now.getHours() * 60 + now.getMinutes();
    const open = parseInt(openingTime.split(':')[0]) * 60 + parseInt(openingTime.split(':')[1] || 0);
    const close = parseInt(closingTime.split(':')[0]) * 60 + parseInt(closingTime.split(':')[1] || 0);
    this.setData({ shopClosed: hm < open || hm >= close });
  },

  // ===== 营业时间设置 =====
  onPickerOpeningTime(e) { this.setData({ openingTime: e.detail.value }); },
  onPickerClosingTime(e) { this.setData({ closingTime: e.detail.value }); },
  onInputClosedTitle(e) { this.setData({ closedTitle: e.detail.value }); },
  onInputClosedMessage(e) { this.setData({ closedMessage: e.detail.value }); },

  async onSaveBusinessHours() {
    const { openingTime, closingTime, closedTitle, closedMessage } = this.data;
    wx.showLoading({ title: '保存中...', mask: true });
    try {
      await wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'setHomeSettings', openingTime, closingTime, closedTitle, closedMessage },
      });
      this.setData({ _bizHoursSaved: { openingTime, closingTime, closedTitle, closedMessage } });
      this._checkShopClosed();
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onCancelBusinessHours() {
    const s = this.data._bizHoursSaved;
    this.setData({
      openingTime: s.openingTime || '', closingTime: s.closingTime || '',
      closedTitle: s.closedTitle || '', closedMessage: s.closedMessage || '',
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
      fail: (err) => {
        console.error('[Hero] chooseMedia 失败:', err);
        wx.showToast({ title: err.errMsg || '选择失败', icon: 'none' });
      },
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
      wx.removeStorageSync('_admin_hero');
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

  // ===== 首页商品展示 =====

  _loadFeaturedProducts() {
    wx.cloud.callFunction({
      name: 'initDB',
      data: { action: 'getFeaturedProducts' },
    }).then(async (res) => {
      const items = (res.result && res.result.data) || [];
      if (items.length === 0) {
        this.setData({ featuredItems: [], _featuredFileIDs: [] });
        return;
      }
      const fileIDs = items.map(i => i.imageFileID).filter(Boolean);
      const urlRes = await wx.cloud.getTempFileURL({ fileList: fileIDs });
      const urlMap = {};
      urlRes.fileList.forEach((f, i) => { urlMap[fileIDs[i]] = f.tempFileURL; });
      const featuredItems = items.map((item, i) => ({
        productId: item.productId || '',
        imageURL: urlMap[item.imageFileID] || item.imageFileID,
        imageFileID: item.imageFileID,
        name: item.name || '',
        sortOrder: i,
      }));
      this.setData({ featuredItems, _featuredFileIDs: fileIDs.slice() });
    }).catch(e => {
      console.warn('[Featured] 加载失败', e);
      this.setData({ featuredItems: [], _featuredFileIDs: [] });
    });
  },

  // 查询商品名称
  _fillFeaturedProductNames(items) {
    const ids = items.map(i => i.productId).filter(Boolean);
    if (ids.length === 0) return;
    const db = wx.cloud.database();
    db.collection('products').where({ _id: db.command.in(ids) }).get().then(res => {
      const nameMap = {};
      (res.data || []).forEach(p => { nameMap[p._id] = p.name; });
      const updated = this.data.featuredItems.map(item => ({
        ...item,
        name: nameMap[item.productId] || '未知商品',
      }));
      this.setData({ featuredItems: updated });
    }).catch(e => {
      console.warn('[Featured] 查询商品名失败', e);
    });
  },

  // 添加展示商品
  onAddFeaturedProduct() {
    const onSale = (this.data.products || []).filter(p => p.saleStatus === 'on');
    if (onSale.length === 0) {
      wx.showToast({ title: '无在售商品', icon: 'none' });
      return;
    }
    // 使用自定义弹窗选择商品（避免 wx.showActionSheet 的 6 项限制和真机兼容问题）
    this.setData({
      showFeaturedPicker: true,
      featuredPickerProducts: onSale,
    });
  },

  onCloseFeaturedPicker() {
    this.setData({ showFeaturedPicker: false });
  },

  onSelectFeaturedProduct(e) {
    const index = e.currentTarget.dataset.index;
    const product = this.data.featuredPickerProducts[index];
    this.setData({ showFeaturedPicker: false });
    if (product) {
      this._uploadFeaturedImage(product);
    }
  },

  // 上传宣传图后追加到列表
  _uploadFeaturedImage(product) {
    this.setData({ _featuredModified: true });
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...', mask: true });
        try {
          const { fileID, tempURL } = await this._uploadToCloud(path);
          const item = { productId: product._id, name: product.name, imageURL: tempURL, imageFileID: fileID };
          const featuredItems = this.data.featuredItems.concat([item]);
          const _featuredFileIDs = this.data._featuredFileIDs.concat([fileID]);
          this.setData({ featuredItems, _featuredFileIDs });
          wx.hideLoading();
        } catch (e) {
          wx.hideLoading();
          console.error('[Featured] 上传失败', e);
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      },
      fail: () => {
        if (this.data.featuredItems.length === 0) {
          this.setData({ _featuredModified: false });
        }
      },
    });
  },

  // 替换展示图
  onReplaceFeaturedImage(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({ _featuredModified: true });
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...', mask: true });
        try {
          const { fileID, tempURL } = await this._uploadToCloud(path);
          const items = this.data.featuredItems.slice();
          const ids = this.data._featuredFileIDs.slice();
          items[index] = { ...items[index], imageURL: tempURL, imageFileID: fileID };
          ids[index] = fileID;
          this.setData({ featuredItems: items, _featuredFileIDs: ids });
          wx.hideLoading();
        } catch (e) {
          wx.hideLoading();
          console.error('[Featured] 替换失败', e);
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      },
    });
  },

  // 删除展示项
  onDeleteFeaturedItem(e) {
    const index = e.currentTarget.dataset.index;
    const items = this.data.featuredItems.slice();
    const ids = this.data._featuredFileIDs.slice();
    items.splice(index, 1);
    ids.splice(index, 1);
    this.setData({ featuredItems: items, _featuredFileIDs: ids, _featuredModified: true });
  },

  // 保存展示商品
  async onSaveFeaturedProducts() {
    const items = this.data.featuredItems.map((item, i) => ({
      productId: item.productId,
      imageFileID: item.imageFileID,
      sortOrder: i,
    }));
    wx.showLoading({ title: '保存中...', mask: true });
    try {
      await wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'setFeaturedProducts', items },
      });
      this.setData({ _featuredModified: false });
      wx.hideLoading();
      wx.removeStorageSync('_admin_featured');
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      console.error('[Featured] 保存失败', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onCancelFeaturedProducts() {
    this.setData({ _featuredModified: false });
    this._loadFeaturedProducts();
  },

  // ===== 拖拽排序（长按卡片2秒启动；短按则替换图片） =====

  // 按下拖拽按钮 → 记录位置，启动2秒计时器
  onFeaturedDragStart(e) {
    const index = e.currentTarget.dataset.index;
    const touch = e.touches[0];

    if (this.data._dragTimer) clearTimeout(this.data._dragTimer);

    this.setData({
      _dragTargetIndex: index,
      _dragStartX: touch.clientX,
      _dragStartY: touch.clientY,
    });

    const timer = setTimeout(() => {
      wx.vibrateShort({ type: 'medium' });
      this._calcGridSize();
      this.setData({
        _dragActive: true,
        _draggingIndex: index,
        _dragOffsetX: 0,
        _dragOffsetY: 0,
        _featuredModified: true,
      });
    }, 1000);

    this.data._dragTimer = timer;
  },

  // 移动 → 只更新 translateY 跟随手指，不交换数组
  onFeaturedDragMove(e) {
    if (!(this.data._dragTargetIndex >= 0)) return;
    const touch = e.touches[0];

    if (!this.data._dragActive) {
      if (Math.abs(touch.clientX - this.data._dragStartX) > 10 ||
          Math.abs(touch.clientY - this.data._dragStartY) > 10) {
        this._cancelDrag();
      }
      return;
    }

    // 只更新偏移量，保持数组不变，视觉上卡片跟随手指
    this.setData({ _dragOffsetY: touch.clientY - this.data._dragStartY });
  },

  // 松手 → 计算最终位置，交换数组，重置偏移
  onFeaturedDragEnd() {
    if (!this.data._dragActive) { this._cancelDrag(); return; }

    const { _draggingIndex: fromIdx, _dragOffsetY, _dragItemH, featuredItems } = this.data;
    const step = Math.round(_dragOffsetY / _dragItemH);
    const toIdx = Math.max(0, Math.min(featuredItems.length - 1, fromIdx + step));

    // 交换数组
    if (toIdx !== fromIdx) {
      const items = featuredItems.slice();
      const ids = this.data._featuredFileIDs.slice();
      [items[fromIdx], items[toIdx]] = [items[toIdx], items[fromIdx]];
      [ids[fromIdx], ids[toIdx]] = [ids[toIdx], ids[fromIdx]];
      this.setData({
        featuredItems: items,
        _featuredFileIDs: ids,
      });
    }

    // 重置所有拖拽状态
    this.setData({
      _dragActive: false,
      _draggingIndex: -1,
      _dragOffsetX: 0,
      _dragOffsetY: 0,
    });
    this._cancelDrag();
  },

  _cancelDrag() {
    if (this.data._dragTimer) { clearTimeout(this.data._dragTimer); this.data._dragTimer = null; }
    this.setData({
      _dragTimer: null,
      _dragTargetIndex: -1,
      _dragStartX: 0,
      _dragStartY: 0,
    });
  },

  _calcGridSize() {
    // 单列布局，只需要单项高度（图片320rpx + 信息行约50rpx + gap 24rpx）
    const screenW = wx.getWindowInfo().windowWidth;
    const itemH = (320 + 50 + 24) * (screenW / 375);
    this.setData({ _dragItemH: itemH });
  },

  // ===== 商品卡片拖拽排序（长按卡片2秒，单列纵向） =====

  // 记录滚动位置
  onAdminScroll(e) {
    if (!this.data._prodDragActive) {
      this.data._realScrollTop = e.detail.scrollTop;
    }
  },

  onProductDragStart(e) {
    const index = e.currentTarget.dataset.index;
    const touch = e.touches[0];
    if (this.data._prodDragTimer) clearTimeout(this.data._prodDragTimer);
    this.setData({ _prodDragTarget: index, _prodDragStartY: touch.clientY });
    const timer = setTimeout(() => {
      wx.vibrateShort({ type: 'medium' });
      // 估算卡片高度
      const screenW = wx.getWindowInfo().windowWidth;
      this.setData({
        _prodDragItemH: 140 * (screenW / 375),
        _prodDragActive: true, _prodDragIdx: index, _prodDragOffY: 0,
        _lockedScrollTop: this.data._realScrollTop,
      });
    }, 1000);
    this.data._prodDragTimer = timer;
  },

  onProductDragMove(e) {
    if (this.data._prodDragTarget < 0) return;
    const touch = e.touches[0];
    if (!this.data._prodDragActive) {
      if (Math.abs(touch.clientY - this.data._prodDragStartY) > 10) this._prodCancelDrag();
      return;
    }
    // 只更新偏移量（scroll-y=false 已阻止滚动）
    this.setData({ _prodDragOffY: touch.clientY - this.data._prodDragStartY });
  },

  onProductDragEnd() {
    if (!this.data._prodDragActive) { this._prodCancelDrag(); return; }

    const fromIdx = this.data._prodDragIdx;
    const offY = this.data._prodDragOffY;
    const step = Math.round(offY / this.data._prodDragItemH);
    const toIdx = Math.max(0, Math.min(this.data.filteredProducts.length - 1, fromIdx + step));

    // 交换数组
    if (toIdx !== fromIdx) {
      const arr = this.data.filteredProducts.slice();
      [arr[fromIdx], arr[toIdx]] = [arr[toIdx], arr[fromIdx]];
      const prods = this.data.products.slice();
      const fromId = this.data.filteredProducts[fromIdx]._id;
      const toId = this.data.filteredProducts[toIdx]._id;
      const fromPIdx = prods.findIndex(p => p._id === fromId);
      const toPIdx = prods.findIndex(p => p._id === toId);
      if (fromPIdx >= 0 && toPIdx >= 0) {
        [prods[fromPIdx], prods[toPIdx]] = [prods[toPIdx], prods[fromPIdx]];
      }
      this.setData({ filteredProducts: arr, products: prods });
    }

    const savedTop = this.data._realScrollTop;
    this.setData({
      _prodDragActive: false, _prodDragIdx: -1, _prodDragOffY: 0,
      _lockedScrollTop: savedTop,
    });
    // 延迟恢复滚动位置
    setTimeout(() => { this.setData({ _lockedScrollTop: savedTop }); }, 150);
    this._prodCancelDrag();
    this._saveProductSortOrder();
  },

  _prodCancelDrag() {
    if (this.data._prodDragTimer) { clearTimeout(this.data._prodDragTimer); this.data._prodDragTimer = null; }
    this.setData({ _prodDragTimer: null, _prodDragTarget: -1, _prodDragStartY: 0 });
  },

  // 将当前 products 顺序的 sortOrder 写入数据库
  async _saveProductSortOrder() {
    const updates = this.data.products.map((p, i) => ({ _id: p._id, sortOrder: i }));
    try {
      await wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'updateSortOrder', updates },
      });
      console.log('[Products] 排序已保存');
    } catch (e) {
      console.warn('[Products] 排序保存失败', e);
    }
  },

  // ===== 分享链接设置 =====

  /**
   * 将临时 URL 转换为 fileID（兼容旧数据）
   * 临时 URL 格式：https://636c-cloud3-d2gbcvyqkbc0fbf94-1419079738.tcb.qcloud.la/path/to/file.jpg
   * fileID 格式：cloud://636c-cloud3-d2gbcvyqkbc0fbf94-1419079738.tcb.qcloud.la/path/to/file.jpg
   */
  _convertTempURLToFileID(url) {
    if (!url) return '';
    // 已经是 fileID 格式，直接返回
    if (url.startsWith('cloud://')) return url;
    // 将 https:// 替换为 cloud://
    if (url.startsWith('https://')) {
      return url.replace('https://', 'cloud://');
    }
    return url;
  },

  /**
   * 从云数据库加载分享配置
   * 参考英雄区轮播图的简洁实现，将 fileID 转换为临时链接用于显示
   */
  async _loadShareConfigFromCloud() {
    const cached = cacheGet('share');
    if (cached) { this.setData(cached); return; }
    console.log('[Share] 开始从云端加载分享配置');
    try {
      const db = wx.cloud.database();
      const res = await db.collection('share_config').doc('index_share').get();
      const data = res.data || {};
      console.log('[Share] 云端数据:', data);

      // 兼容旧数据：将临时 URL 转换为 fileID
      const shareImageFileID = this._convertTempURLToFileID(data.shareImage);
      const timelineImageFileID = this._convertTempURLToFileID(data.timelineImage);

      // 获取图片 fileID 列表
      const imageFileIDs = [];
      if (shareImageFileID) imageFileIDs.push(shareImageFileID);
      if (timelineImageFileID) imageFileIDs.push(timelineImageFileID);

      // 转换 fileID 为临时链接
      let shareImageURL = '';
      let timelineImageURL = '';
      if (imageFileIDs.length > 0) {
        try {
          const urlRes = await wx.cloud.getTempFileURL({ fileList: imageFileIDs });
          const urlMap = {};
          urlRes.fileList.forEach((item, index) => {
            urlMap[imageFileIDs[index]] = item.tempFileURL;
          });
          shareImageURL = shareImageFileID ? urlMap[shareImageFileID] || '' : '';
          timelineImageURL = timelineImageFileID ? urlMap[timelineImageFileID] || '' : '';
        } catch (e) {
          console.warn('[Share] 获取图片临时链接失败', e);
        }
      }

      const finalConfig = {
        shareConfig: {
          shareTitle: data.shareTitle || '',
          timelineTitle: data.timelineTitle || '',
          shareImage: shareImageURL,
          timelineImage: timelineImageURL,
          path: data.path || ''
        },
        _shareConfig: {
          shareImage: shareImageFileID,
          timelineImage: timelineImageFileID
        },
        _shareConfigSaved: {
          shareTitle: data.shareTitle || '',
          timelineTitle: data.timelineTitle || '',
          shareImage: shareImageFileID,
          timelineImage: timelineImageFileID,
          path: data.path || '',
          shareImageURL: shareImageURL,
          timelineImageURL: timelineImageURL
        }
      };
      console.log('[Share] 设置数据:', finalConfig);
      this.setData(finalConfig);
      cacheSet('share', finalConfig, 5 * 60 * 1000);
      console.log('[Share] 加载完成');
    } catch (e) {
      console.error('[Share] 加载分享配置失败', e);
      // 加载失败或文档不存在时使用空值（首次使用时文档不存在是正常的）
      if (e.errMsg && e.errMsg.includes('cannot find document')) {
        console.log('[Share] 云端无配置文档，首次使用');
      } else {
        console.warn('[Share] 加载分享配置失败', e);
      }
    }
  },

  onInputShareTitle(e) {
    this.setData({ 'shareConfig.shareTitle': e.detail.value });
  },

  onInputTimelineTitle(e) {
    this.setData({ 'shareConfig.timelineTitle': e.detail.value });
  },

  onInputSharePath(e) {
    this.setData({ 'shareConfig.path': e.detail.value });
  },

  /**
   * 选择分享图片
   * 选图后自动弹出裁剪界面，按类型指定裁剪比例：
   *   - share（分享给朋友）：5:4
   *   - timeline（分享到朋友圈）：1:1
   * 用户取消裁剪则中止上传；裁剪出错时回退到居中自动裁剪。
   */
  onChooseShareImage(e) {
    const type = e.currentTarget.dataset.type; // 'share' 或 'timeline'
    const cropScale = type === 'share' ? '5:4' : '1:1';

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const originalPath = res.tempFiles[0].tempFilePath;

        // 步骤1：调用 wx.cropImage 按比例裁剪
        let croppedPath = originalPath;
        try {
          croppedPath = await new Promise((resolve, reject) => {
            wx.cropImage({
              src: originalPath,
              cropScale: cropScale,
              success: (cropRes) => {
                console.log('[Share] 裁剪成功, cropScale:', cropScale);
                resolve(cropRes.tempFilePath);
              },
              fail: (cropErr) => {
                console.warn('[Share] wx.cropImage 失败，回退到居中自动裁剪', cropErr);
                reject(cropErr);
              }
            });
          });
        } catch (cropErr) {
          // 用户取消裁剪（crop cancel）→ 中止上传
          if (cropErr.errMsg && cropErr.errMsg.indexOf('cancel') !== -1) {
            console.log('[Share] 用户取消裁剪');
            return;
          }
          // 裁剪失败 → 回退到居中自动裁剪
          try {
            croppedPath = await this._cropImageToRatio(originalPath, cropScale);
            console.log('[Share] 居中自动裁剪完成');
          } catch (fallbackErr) {
            console.error('[Share] 居中自动裁剪也失败，使用原图上传', fallbackErr);
            croppedPath = originalPath;
          }
        }

        // 步骤2：上传裁剪后的图片到云存储
        wx.showLoading({ title: '上传中...', mask: true });
        try {
          const rawExt = croppedPath.split('?')[0].split('.').pop() || '';
          const ext = rawExt.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'jpg';
          const cloudPath = `share-images/${type}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const uploadRes = await new Promise((resolve, reject) => {
            wx.cloud.uploadFile({
              cloudPath,
              filePath: croppedPath,
              success: resolve,
              fail: reject
            });
          });
          // 获取临时链接
          const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
          const tempURL = urlRes.fileList[0].tempFileURL;
          // 更新配置
          if (type === 'share') {
            this.setData({ 'shareConfig.shareImage': tempURL, '_shareConfig.shareImage': uploadRes.fileID });
          } else {
            this.setData({ 'shareConfig.timelineImage': tempURL, '_shareConfig.timelineImage': uploadRes.fileID });
          }
          wx.hideLoading();
          wx.showToast({ title: '上传成功', icon: 'success' });
        } catch (e) {
          wx.hideLoading();
          console.error('[Share] 上传图片失败', e);
          wx.showToast({ title: '上传失败，请重试', icon: 'none' });
        }
      }
    });
  },

  /**
   * 兜底方案：使用离屏 Canvas 居中裁剪图片到指定比例（兼容 Skyline 渲染引擎）
   * @param {string} src - 原图临时路径
   * @param {string} cropScale - 裁剪比例，如 '5:4' 或 '1:1'
   * @returns {Promise<string>} 裁剪后的 tempFilePath
   */
  _cropImageToRatio(src, cropScale) {
    return new Promise((resolve, reject) => {
      // 解析目标比例
      const [wRatio, hRatio] = cropScale.split(':').map(Number);
      const targetRatio = wRatio / hRatio;

      // 获取原图尺寸
      wx.getImageInfo({
        src,
        success: (imgInfo) => {
          const imgW = imgInfo.width;
          const imgH = imgInfo.height;
          const imgRatio = imgW / imgH;

          // 计算居中裁剪区域
          let cropW, cropH, cropX, cropY;
          if (imgRatio > targetRatio) {
            // 原图更宽，以高度为基准
            cropH = imgH;
            cropW = Math.round(cropH * targetRatio);
            cropX = Math.round((imgW - cropW) / 2);
            cropY = 0;
          } else {
            // 原图更高，以宽度为基准
            cropW = imgW;
            cropH = Math.round(cropW / targetRatio);
            cropX = 0;
            cropY = Math.round((imgH - cropH) / 2);
          }

          // 限制输出尺寸，防止内存过大
          const maxEdge = 1024;
          let outW = cropW;
          let outH = cropH;
          if (Math.max(outW, outH) > maxEdge) {
            const scale = maxEdge / Math.max(outW, outH);
            outW = Math.round(outW * scale);
            outH = Math.round(outH * scale);
          }

          try {
            // 使用离屏 Canvas（兼容 Skyline 渲染引擎）
            const canvas = wx.createOffscreenCanvas({
              type: '2d',
              width: outW,
              height: outH
            });
            const ctx = canvas.getContext('2d');

            // 加载图片并绘制裁剪区域
            const img = canvas.createImage();
            img.onload = () => {
              ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
              // 导出裁剪后的图片
              wx.canvasToTempFilePath({
                canvas: canvas,
                x: 0,
                y: 0,
                width: outW,
                height: outH,
                destWidth: outW,
                destHeight: outH,
                success: (exportRes) => {
                  resolve(exportRes.tempFilePath);
                },
                fail: (exportErr) => {
                  reject(exportErr);
                }
              });
            };
            img.onerror = (imgErr) => {
              reject(imgErr);
            };
            img.src = src;
          } catch (offscreenErr) {
            // 如果离屏 Canvas 不可用，直接返回原图
            console.warn('[Share] 离屏 Canvas 不可用，使用原图', offscreenErr);
            resolve(src);
          }
        },
        fail: (imgErr) => {
          reject(imgErr);
        }
      });
    });
  },

  /**
   * 保存分享配置到云数据库
   */
  async onSaveShareConfig() {
    const { shareConfig, _shareConfig } = this.data;
    wx.showLoading({ title: '保存中...', mask: true });
    try {
      await wx.cloud.callFunction({
        name: 'initDB',
        data: {
          action: 'setShareConfig',
          shareTitle: shareConfig.shareTitle,
          timelineTitle: shareConfig.timelineTitle,
          shareImage: _shareConfig.shareImage || '', // 保存 fileID 而不是临时链接
          timelineImage: _shareConfig.timelineImage || '', // 保存 fileID 而不是临时链接
          path: shareConfig.path
        }
      });
      // 更新保存的配置，同时保存显示用的临时链接和持久用的 fileID
      this.setData({
        _shareConfigSaved: {
          shareTitle: shareConfig.shareTitle,
          timelineTitle: shareConfig.timelineTitle,
          shareImage: _shareConfig.shareImage || '', // fileID
          timelineImage: _shareConfig.timelineImage || '', // fileID
          path: shareConfig.path,
          shareImageURL: shareConfig.shareImage, // 临时链接用于取消时恢复
          timelineImageURL: shareConfig.timelineImage // 临时链接用于取消时恢复
        }
      });
      wx.hideLoading();
      wx.removeStorageSync('_admin_share');
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      console.error('[Share] 保存失败', e);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },

  onCancelShareConfig() {
    const { _shareConfigSaved } = this.data;
    this.setData({
      shareConfig: {
        shareTitle: _shareConfigSaved.shareTitle || '',
        timelineTitle: _shareConfigSaved.timelineTitle || '',
        shareImage: _shareConfigSaved.shareImageURL || '',
        timelineImage: _shareConfigSaved.timelineImageURL || '',
        path: _shareConfigSaved.path || ''
      },
      _shareConfig: {
        shareImage: _shareConfigSaved.shareImage || '',
        timelineImage: _shareConfigSaved.timelineImage || ''
      }
    });
  },

  onShow() {
    // 有未保存的修改时不刷新，避免覆盖本地预览图
    if (!this.data._heroModified) {
      this._loadHeroImagesFromCloud();
    }
    if (!this.data._featuredModified) {
      this._loadFeaturedProducts();
    }
    this._loadOrdersFromCloud();
    // 刷新统计数据
    if (this.data.activeTab === 'stats') {
      this._loadStatisticsFromCloud(this.data.statsPeriod);
    }
    // 每 10 秒自动刷新订单
    this._orderPollTimer = setInterval(() => {
      this._loadOrdersFromCloud();
    }, 10000);
  },
  onHide() {
    if (this._orderPollTimer) {
      clearInterval(this._orderPollTimer);
      this._orderPollTimer = null;
    }
  },
  onUnload() {
    if (this._orderPollTimer) {
      clearInterval(this._orderPollTimer);
      this._orderPollTimer = null;
    }
  },
  onPullDownRefresh() {},
  onReachBottom() {},
  onShareAppMessage() {},
  onRequestSubscribe() {
    if (this._subscribePending) { return; }
    this._subscribePending = true;
    const ids = [SUBSCRIBE.PAYMENT_SUCCESS, SUBSCRIBE.PICKUP_NOTIFY];
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: (res) => {
        const payOk = res[SUBSCRIBE.PAYMENT_SUCCESS] === 'accept';
        const pickupOk = res[SUBSCRIBE.PICKUP_NOTIFY] === 'accept';
        if (payOk && pickupOk) {
          wx.showToast({ title: '通知已全部开启', icon: 'success' });
        } else if (payOk) {
          wx.showToast({ title: '新订单通知已开启', icon: 'success' });
        } else if (pickupOk) {
          wx.showToast({ title: '取餐通知已开启', icon: 'success' });
        } else {
          wx.showToast({ title: '请勾选至少一项通知', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('[Subscribe] 后台授权失败:', JSON.stringify(err));
      },
      complete: () => { this._subscribePending = false; },
    });
  },

  noop() {},  // 空函数，用于 catchtouchmove 占位

  // ========== 桌面点单二维码管理 ==========

  // 加载桌位列表
  async _loadTablesFromCloud() {
    try {
      const res = await wx.cloud.callFunction({ name: 'initDB', data: { action: 'getTables' } });
      if (res.result && res.result.success) {
        const tables = res.result.data || [];
        // 获取 QR 预览图临时 URL
        for (const t of tables) {
          if (t.qrFileID) {
            try {
              const tmp = await wx.cloud.getTempFileURL({ fileList: [t.qrFileID] });
              t.qrTempURL = (tmp.fileList && tmp.fileList[0]) ? tmp.fileList[0].tempFileURL : '';
            } catch (e) { t.qrTempURL = ''; }
          } else {
            t.qrTempURL = '';
          }
        }
        this.setData({ tables, _tablesLoaded: true });
      }
    } catch (e) {
      console.error('[Tables] 加载桌位失败:', e.message);
    }
  },

  // 打开新增桌位弹窗
  onAddTable() {
    this.setData({
      showTableModal: true,
      editingTable: { id: null, name: '', enabled: true }
    });
  },

  // 打开编辑桌位弹窗
  onEditTable(e) {
    const id = e.currentTarget.dataset.id;
    const table = this.data.tables.find(t => t._id === id);
    if (table) {
      this.setData({
        showTableModal: true,
        editingTable: { id: table._id, name: table.name, enabled: table.enabled }
      });
    }
  },

  // 输入桌位名称
  onInputTableName(e) {
    this.setData({ 'editingTable.name': e.detail.value });
  },

  // 切换启用状态
  onToggleTableEnabled() {
    this.setData({ 'editingTable.enabled': !this.data.editingTable.enabled });
  },

  // 关闭桌位弹窗
  onCloseTableModal() {
    this.setData({ showTableModal: false });
  },

  // 保存桌位（新增或编辑）
  async onSaveTable() {
    const { id, name, enabled } = this.data.editingTable;
    if (!name || !name.trim()) {
      wx.showToast({ title: '请输入桌位名称', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    try {
      if (id) {
        await wx.cloud.callFunction({
          name: 'initDB',
          data: { action: 'updateTable', id, name: name.trim(), enabled }
        });
      } else {
        await wx.cloud.callFunction({
          name: 'initDB',
          data: { action: 'addTable', name: name.trim() }
        });
      }
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ showTableModal: false });
      this._loadTablesFromCloud();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败: ' + e.message, icon: 'none' });
    }
  },

  // 删除桌位
  onDeleteTable(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后将无法恢复，该桌位的二维码也将失效。',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            await wx.cloud.callFunction({
              name: 'initDB',
              data: { action: 'deleteTable', id }
            });
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            this._loadTablesFromCloud();
          } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '删除失败: ' + e.message, icon: 'none' });
          }
        }
      }
    });
  },

  // 生成/重新生成二维码
  onGenerateQR(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.tableQRLoading) return;  // 防抖
    this.setData({ tableQRLoading: id });
    wx.showLoading({ title: '生成中...' });
    wx.cloud.callFunction({
      name: 'generateTableQRCode',
      data: { tableId: id }
    }).then(res => {
      wx.hideLoading();
      this.setData({ tableQRLoading: '' });
      if (res.result && res.result.success) {
        wx.showToast({ title: '二维码已生成', icon: 'success' });
        // 更新行内预览
        const tables = this.data.tables.map(t => {
          if (t._id === id) {
            t.qrFileID = res.result.qrFileID;
            t.qrTempURL = res.result.tempURL;
          }
          return t;
        });
        this.setData({ tables });
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '生成失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({ tableQRLoading: '' });
      wx.showToast({ title: '生成失败: ' + err.message, icon: 'none' });
    });
  },

  // 下载二维码到相册
  onDownloadQR(e) {
    const id = e.currentTarget.dataset.id;
    const table = this.data.tables.find(t => t._id === id);
    if (!table || !table.qrFileID) {
      wx.showToast({ title: '请先生成二维码', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    // 先获取云存储临时链接，再通过 wx.downloadFile 下载（兼容 Skyline）
    wx.cloud.getTempFileURL({
      fileList: [table.qrFileID],
      success: (tmpRes) => {
        const tempURL = (tmpRes.fileList && tmpRes.fileList[0]) ? tmpRes.fileList[0].tempFileURL : '';
        if (!tempURL) {
          wx.hideLoading();
          wx.showToast({ title: '获取图片失败', icon: 'none' });
          return;
        }
        wx.downloadFile({
          url: tempURL,
          success: (dlRes) => {
            wx.hideLoading();
            if (dlRes.statusCode !== 200) {
              wx.showToast({ title: '下载失败', icon: 'none' });
              return;
            }
            wx.saveImageToPhotosAlbum({
              filePath: dlRes.tempFilePath,
              success: () => { wx.showToast({ title: '已保存到相册', icon: 'success' }); },
              fail: (err) => {
                const msg = err.errMsg || '';
                if (msg.includes('auth deny') || msg.includes('auth denied')) {
                  wx.showModal({
                    title: '需要相册权限',
                    content: '请在设置中允许小程序保存图片到相册',
                    success: (modalRes) => { if (modalRes.confirm) wx.openSetting(); }
                  });
                } else if (msg.includes('not declared') || msg.includes('privacy')) {
                  wx.showModal({
                    title: '隐私协议未声明',
                    content: '请到小程序管理后台「设置-隐私保护设置」中添加"保存图片到相册"的隐私声明',
                    showCancel: false
                  });
                } else {
                  wx.showToast({ title: '保存失败', icon: 'none' });
                }
              }
            });
          },
          fail: (err) => {
            wx.hideLoading();
            wx.showToast({ title: '下载失败: ' + (err.errMsg || ''), icon: 'none' });
          }
        });
      },
      fail: (err) => {
        wx.hideLoading();
        wx.showToast({ title: '获取图片链接失败', icon: 'none' });
      }
    });
  },

})
