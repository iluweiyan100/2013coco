// pages/admin/admin.js
Page({

  data: {
    activeTab: 'stats',

    // ===== 数据统计 =====
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
      '蜜处理'
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

    // 英雄区轮播图（heroImages 为显示用临时 URL，_heroFileIDs 为云存储 fileID）
    heroImages: [],
    _heroFileIDs: [],
    _heroModified: false,  // 是否有未保存的修改，true 时 onShow 不刷新

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
    // 切换到数据统计 Tab 时刷新统计数据
    if (newTab === 'stats') {
      this._loadStatisticsFromCloud();
    }
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

  // ===== 数据统计 =====

  /**
   * 从云数据库加载统计数据
   * 包括：今日销售额、订单量、客单价、商品销售排行
   */
  async _loadStatisticsFromCloud() {
    try {
      const db = wx.cloud.database();

      // 获取今天的开始时间（北京时间，考虑时区）
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      // 北京时间 UTC+8，需要减去 8 小时的偏移
      todayStart.setHours(todayStart.getHours() - 8);

      // 转换为云数据库需要的日期格式
      const startDate = new Date(todayStart.getTime());

      // 查询今天的订单（排除已退款的）
      const todayRes = await db.collection('orders')
        .where({
          createTime: db.command.gte(startDate),
          status: db.command.neq('refunded')
        })
        .get();

      const todayOrders = todayRes.data || [];

      // 计算今日销售额和订单量
      let todayTotalAmount = 0;
      todayOrders.forEach(order => {
        todayTotalAmount += order.totalAmount || 0;
      });

      // 查询所有订单（用于计算商品销售排行，排除已退款的）
      const allRes = await db.collection('orders')
        .where({
          status: db.command.neq('refunded')
        })
        .get();

      const allOrders = allRes.data || [];

      // 统计商品销售数据
      const productStats = {}; // { name: { sales: 0, revenue: 0 } }
      allOrders.forEach(order => {
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

      // 计算客单价（总销售额 / 订单数）
      let totalAmount = 0;
      allOrders.forEach(order => {
        totalAmount += order.totalAmount || 0;
      });
      const avgOrderValue = allOrders.length > 0
        ? Math.round((totalAmount / allOrders.length) * 100) / 100
        : 0;

      // 更新数据
      this.setData({
        todaySales: Math.round(todayTotalAmount * 100) / 100,
        orderCount: allOrders.length,
        avgOrderValue,
        productRanking: rankingList
      });

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
      const res = await db.collection('orders')
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
    console.log('[WiFi] 开始从云端加载 Wi-Fi 设置');
    try {
      const db = wx.cloud.database();
      const res = await db.collection('homeSettings').doc('config').get();
      const data = res.data || {};
      console.log('[WiFi] 云端数据:', data);
      this.setData({
        wifiName: data.wifiName || '',
        wifiPassword: data.wifiPassword || '',
        _wifiNameSaved: data.wifiName || '',
        _wifiPasswordSaved: data.wifiPassword || ''
      });
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
   */
  onChooseShareImage(e) {
    const type = e.currentTarget.dataset.type; // 'share' 或 'timeline'
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...', mask: true });
        try {
          // 上传到云存储
          const rawExt = path.split('?')[0].split('.').pop() || '';
          const ext = rawExt.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'jpg';
          const cloudPath = `share-images/${type}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const uploadRes = await new Promise((resolve, reject) => {
            wx.cloud.uploadFile({
              cloudPath,
              filePath: path,
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
    this._loadOrdersFromCloud();
    // 刷新统计数据
    if (this.data.activeTab === 'stats') {
      this._loadStatisticsFromCloud();
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
  onShareAppMessage() {}
})
