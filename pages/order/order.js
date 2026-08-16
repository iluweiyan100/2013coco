// order.js
const app = getApp();
const pay = require('../../utils/pay.js');
const tableOrder = require('../../utils/tableOrder.js');

Page({
  data: {
    statusBarHeight: 0,
    currentCategory: '',
    cartCount: 0,
    cartMap: {},   // { productId: totalQty }
    categories: [
      { id: 'coco',     name: '可可' },
      { id: 'coffee',   name: '咖啡' },
      { id: 'icecream', name: '冰淇淋' },
      { id: 'dessert',  name: '甜点' },
      { id: 'bar',      name: '巧克力排块' },
      { id: 'other',    name: '无咖啡因饮品' }
    ],
    allProducts: [],
    loading: true,
    scrollToView: '',
    categoryPositions: [],   // 各分类标题相对商品列表顶部的偏移 [{ id, top }]，用于滚动联动

    // 就餐方式（从首页传入，可能为空需在弹窗手动选）
    orderType: '',            // 'dine-in' | 'takeaway' | ''

    // 规格选择小浮窗
    showSpecModal: false,
    specModalProduct: null,   // 当前选规格的商品
    specModalType: '',        // 'temp' | 'scoop'
    specOptions: [],          // 当前弹窗的选项列表
    selectedSpec: '',         // 已选择的规格值
    selectedOrderType: '',     // 弹窗内选择的就餐方式（初始由 orderType 带入）

    // 桌面二维码桌位名
    tableName: '',

    // 桌位共享桌单模式
    tableMode: false,
    tableStatus: 'open',      // open | paying | paid
    tablePickupNumber: '',
    tableItems: []            // 共享桌单条目（实时同步）
  },

  onLoad(options) {
    // 兜底检查打烊状态
    try {
      const hs = wx.getStorageSync('_cache_shopStatus');
      if (hs && hs.closed) { wx.showToast({ title: hs.title || '已打烊', icon: 'none' }); wx.reLaunch({ url: '/pages/index/index' }); return; }
    } catch (e) {}
    this.setData({
      statusBarHeight: wx.getWindowInfo().statusBarHeight
    });
    const type = options.type || '';  // 首页未传则为空
    console.log('[Order] onLoad 接收到的 type 参数:', type);
    this.setData({ orderType: type });
    console.log('[Order] 设置后的 orderType:', this.data.orderType);
    // 保存 scrollTo，_loadProducts 完成后自动定位
    this._pendingScrollTo = options.scrollTo || '';
    // 先从缓存瞬时加载，再异步拉取最新
    const cached = this._cacheGet('_cache_products');
    if (cached) {
      this.setData({
        allProducts: cached.sortedProducts,
        categories: cached.categories,
        currentCategory: cached.categories.length > 0 ? cached.categories[0].id : '',
        loading: false
      });
      this._refreshCartMap();
      this._measureCategoryPositions();
    }
    this._loadProducts();
    this._loadTableContext();
  },

  onShow() {
    this._refreshCartMap();
    // 静默检查商品缓存是否过期（15分钟），过期才刷新
    if (!this._cacheGet('_cache_products')) {
      this._loadProducts();
    }
    this._loadTableContext();
  },

  _loadTableContext() {
    const ctx = getApp().globalData.tableContext
      || wx.getStorageSync('tableContext') || null;
    if (ctx && ctx.code && !ctx.tableName) {
      // 有 code 但 name 未解析（竞态），通过云函数查询（服务端权限）
      this.setData({ tableName: '' });
      wx.cloud.callFunction({
        name: 'initDB',
        data: { action: 'getTableByCode', code: ctx.code }
      }).then(res => {
        if (res.result && res.result.success && res.result.data) {
          const t = res.result.data;
          this.setData({ tableName: t.name });
          ctx.tableName = t.name;
          ctx.tableId = t._id;
          getApp().globalData.tableContext = ctx;
          wx.setStorageSync('tableContext', ctx);
        }
        this._initTableMode();
      }).catch(() => {});
    } else {
      this.setData({
        tableName: (ctx && ctx.tableName) ? ctx.tableName : ''
      });
      this._initTableMode();
    }
  },

  // 初始化桌位共享桌单模式
  _initTableMode() {
    const isTable = tableOrder.isTableMode();
    if (!isTable) {
      if (this.data.tableMode || this._tableId) {
        this._stopTableWatcher();
        this._tableId = '';
        this.setData({ tableMode: false, tableItems: [], tableStatus: 'open', tablePickupNumber: '' });
        this._refreshCartMap();
      }
      return;
    }
    const tableId = tableOrder.getTableId();
    if (!this.data.tableMode) {
      this.setData({ tableMode: true, orderType: 'dine-in' });  // 桌位模式锁定堂食
    }
    this._startTableSession(tableId);
  },

  async _startTableSession(tableId) {
    if (this._tableId === tableId && this._tableWatcher) return;  // 已在监听同一桌
    this._stopTableWatcher();
    this._tableId = tableId;

    try {
      const r = await tableOrder.join(tableId);
      if (r.reset) wx.showToast({ title: '已开启新桌单', icon: 'none', duration: 1500 });
      this._applyTableSession(r.session);
    } catch (e) {
      console.warn('[Order] 加入桌单失败', e);
      tableOrder.getSession(tableId).then(r => this._applyTableSession(r.session)).catch(() => {});
    }

    this._tableWatcher = tableOrder.watch(tableId, {
      onChange: session => this._applyTableSession(session),
      onError: err => {
        console.warn('[Order] 桌单监听失败，重拉', err);
        tableOrder.getSession(tableId).then(r => this._applyTableSession(r.session)).catch(() => {});
      }
    });

    // 每 30s 心跳，保持"在场"状态
    this._heartbeatTimer = setInterval(() => {
      if (tableOrder.isTableMode()) tableOrder.heartbeat(tableId).catch(() => {});
    }, 30000);
  },

  _applyTableSession(session) {
    if (!session) return;
    this.setData({
      tableItems: session.items || [],
      tableStatus: session.status || 'open',
      tablePickupNumber: session.pickupNumber || ''
    }, () => this._refreshCartMap());
  },

  _stopTableWatcher() {
    if (this._tableWatcher) { this._tableWatcher.close(); this._tableWatcher = null; }
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
  },

  onUnload() {
    this._stopTableWatcher();
  },

  _cacheGet(key) {
    try {
      const raw = wx.getStorageSync(key);
      if (raw && raw.time && (Date.now() - raw.time < 15 * 60 * 1000)) {
        return raw.data;
      }
    } catch (e) { /* 忽略 */ }
    return null;
  },
  _cacheSet(key, data) {
    try {
      wx.setStorageSync(key, { time: Date.now(), data });
    } catch (e) { /* 忽略 */ }
  },

  async _loadProducts() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'initDB', data: { action: 'getProducts' } });
      const all = (res.result && res.result.data) || [];
      const products = all
        .filter(p => p.saleStatus === 'on')
        .map(p => {
          // 兼容旧 supportIceHot 字段
          const legacy = p.supportIceHot || false;
          return {
            ...p,
            id: p._id,
            categoryId: p.category,
            categoryName: p.categoryLabel,
            price: Number(p.price),
            image: p.imageURL || p.image || '',
            supportIce: p.supportIce !== undefined ? p.supportIce : legacy,
            supportHot: p.supportHot !== undefined ? p.supportHot : legacy,
            supportNormal: p.supportNormal || false,
            scoopOptions: p.scoopOptions || [],
            // 新增咖啡相关字段
            roastLevel: p.roastLevel || '',          // 烘焙度
            processingMethod: p.processingMethod || '' // 处理法
          };
        });

      const catIds = [...new Set(products.map(p => p.categoryId))];
      const categories = this.data.categories.filter(c => catIds.includes(c.id));

      // 按照分类顺序排序商品
      const categoryOrder = ['coco', 'coffee', 'icecream', 'dessert', 'bar', 'other'];
      const sortedProducts = products.slice().sort((a, b) => {
        return categoryOrder.indexOf(a.categoryId) - categoryOrder.indexOf(b.categoryId);
      });

      this.setData({
        allProducts: sortedProducts,
        categories,
        currentCategory: categories.length > 0 ? categories[0].id : '',
        loading: false
      });
      this._refreshCartMap();
      this._measureCategoryPositions();

      // 缓存商品数据（15分钟有效，减少云端请求）
      this._cacheSet('_cache_products', { categories, sortedProducts });

      // 处理 scrollTo 参数：自动定位到指定商品
      if (this._pendingScrollTo) {
        const targetIndex = sortedProducts.findIndex(p => p.id === this._pendingScrollTo);
        if (targetIndex !== -1) {
          // 先切换到目标商品所属分类
          const targetCat = sortedProducts[targetIndex].categoryId;
          this.setData({
            currentCategory: targetCat,
            scrollToView: `product-${targetIndex}`
          });
        }
        this._pendingScrollTo = '';
      }
    } catch (e) {
      console.warn('[Order] 加载商品失败', e);
      this.setData({ loading: false });
    }
  },

  // 重建 cartMap 和 cartCount（桌位模式从共享桌单，否则从本地购物车）
  _refreshCartMap() {
    if (this.data.tableMode) {
      const items = (this.data.tableItems || []).filter(i => (i.state || 'pending') === 'pending');
      const cartMap = {};
      let total = 0;
      items.forEach(item => {
        cartMap[item.productId] = (cartMap[item.productId] || 0) + (item.qty || 1);
        total += (item.qty || 1);
      });
      this.setData({ cartMap, cartCount: total });
      return;
    }
    const cartItems = app.globalData.cartItems || [];
    const cartMap = {};
    let total = 0;
    cartItems.forEach(item => {
      cartMap[item.id] = (cartMap[item.id] || 0) + item.qty;
      total += item.qty;
    });
    this.setData({ cartMap, cartCount: total });
  },

  onCategoryChange(e) {
    const categoryId = e.currentTarget.dataset.id;
    this.setData({ currentCategory: categoryId });
    const targetIndex = this.data.allProducts.findIndex(p => p.categoryId === categoryId);
    if (targetIndex !== -1) {
      this.setData({ scrollToView: `product-${targetIndex}` });
    }
  },

  // 测量各分类标题在商品列表内的偏移，供右侧滚动时左侧联动
  _measureCategoryPositions() {
    // 等 setData 渲染完成后再测量
    wx.nextTick(() => {
      wx.createSelectorQuery().in(this)
        .select('.product-list').boundingClientRect()
        .select('.product-list').scrollOffset()
        .selectAll('.category-title').boundingClientRect()
        .exec(res => {
          const listRect = res[0];
          const scroll = res[1];
          const titles = res[2] || [];
          if (!listRect || titles.length === 0) return;
          // 分类标题相对滚动内容顶部的偏移 = 视口位置差 + 当前已滚动距离
          const base = listRect.top + (scroll ? scroll.scrollTop : 0);
          const positions = titles.map(t => ({
            id: (t.id || '').replace('category-', ''),
            top: t.top - base
          }));
          this.setData({ categoryPositions: positions });
        });
    });
  },

  // 右侧商品列表滚动：联动左侧分类高亮
  onProductScroll(e) {
    const scrollTop = e.detail.scrollTop;
    const positions = this.data.categoryPositions;
    if (!positions || positions.length === 0) return;
    let current = positions[0].id;
    for (const p of positions) {
      if (p.top <= scrollTop) current = p.id;
    }
    if (current !== this.data.currentCategory) {
      this.setData({ currentCategory: current });
    }
  },

  // 点击「+」：判断是否需要弹规格窗
  onAddToCart(e) {
    const productId = e.currentTarget.dataset.id;
    const product = this.data.allProducts.find(p => p.id === productId);
    if (!product) return;

    // 构建温度选项
    const tempOptions = [];
    if (product.supportIce) tempOptions.push('冰');
    if (product.supportHot) tempOptions.push('热');
    if (product.supportNormal) tempOptions.push('常温');

    const hasSpec = (product.category === 'icecream' && product.scoopOptions && product.scoopOptions.length > 0)
      || tempOptions.length > 0;

    // 有规格 或 未确定就餐方式 → 打开弹窗
    if (hasSpec || !this.data.orderType) {
      const isScoop = product.category === 'icecream' && product.scoopOptions && product.scoopOptions.length > 0;
      const ORDER = ['单球', '双球', '三球', '四球'];
      const sortedScoop = isScoop
        ? product.scoopOptions.slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
        : [];
      console.log('[Order] 打开规格弹窗，orderType:', this.data.orderType);
      this.setData({
        showSpecModal: true,
        specModalProduct: product,
        specModalType: isScoop ? 'scoop' : (tempOptions.length > 0 ? 'temp' : 'none'),
        specOptions: isScoop ? sortedScoop : tempOptions,
        selectedSpec: isScoop ? (sortedScoop.includes('单球') ? '单球' : sortedScoop[0]) : (tempOptions.length > 0 ? tempOptions[0] : ''),
        selectedOrderType: this.data.orderType  // 首页传入则预选
      });
      console.log('[Order] 设置后 selectedOrderType:', this.data.orderType);
      return;
    }

    // 无需选规格 + 已知就餐方式，直接加入购物车
    this._addItemToCart(product, '', this.data.orderType);
  },

  // 规格弹窗：选择规格
  onSelectSpec(e) {
    this.setData({ selectedSpec: e.currentTarget.dataset.val });
  },

  // 规格弹窗：选择就餐方式
  onSelectOrderType(e) {
    this.setData({ selectedOrderType: e.currentTarget.dataset.val });
  },

  // 规格弹窗：确认
  onConfirmSpec() {
    const { specModalProduct, selectedSpec, selectedOrderType, specModalType } = this.data;
    if (!specModalProduct) return;

    // 校验就餐方式
    if (!selectedOrderType) {
      wx.showToast({ title: '请选择堂食或外带', icon: 'none', duration: 1500 });
      return;
    }
    // 校验规格（有选项时必选）
    if (specModalType !== 'none' && !selectedSpec) {
      wx.showToast({ title: '请选择规格', icon: 'none', duration: 1500 });
      return;
    }

    this.setData({ showSpecModal: false });
    this._addItemToCart(specModalProduct, selectedSpec, selectedOrderType);
  },

  // 规格弹窗：立即购买
  onBuyNow() {
    if (this.data.tableMode) {
      wx.showToast({ title: '桌位模式请用「一起付」', icon: 'none', duration: 1500 });
      return;
    }
    const { specModalProduct, selectedSpec, selectedOrderType, specModalType } = this.data;
    if (!specModalProduct) return;

    // 校验就餐方式
    if (!selectedOrderType) {
      wx.showToast({ title: '请选择堂食或外带', icon: 'none', duration: 1500 });
      return;
    }
    // 校验规格（有选项时必选）
    if (specModalType !== 'none' && !selectedSpec) {
      wx.showToast({ title: '请选择规格', icon: 'none', duration: 1500 });
      return;
    }

    // 关闭弹窗，调起支付
    this.setData({ showSpecModal: false });
    pay.pay({
      orderGroups: [{
        items: [{
          id: specModalProduct.id,
          name: specModalProduct.name,
          price: specModalProduct.price,
          qty: 1,
          spec: selectedSpec
        }],
        orderType: selectedOrderType,
        remark: ''
      }],
      onSuccess: () => {
        wx.reLaunch({ url: '/pages/orders/orders' });
      }
    });
  },

  // 规格弹窗：取消
  onCancelSpec() {
    this.setData({ showSpecModal: false });
  },

  // 点击「-」：减少购物车中该商品数量（按 id 减，不区分规格，减最后一条）
  async onRemoveFromCart(e) {
    const productId = e.currentTarget.dataset.id;

    if (this.data.tableMode) {
      const myOpenid = wx.getStorageSync('openid') || getApp().globalData.openid || '';
      const items = this.data.tableItems || [];
      let last = null;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.productId === productId && (it.state || 'pending') === 'pending' && (it.addedBy || '') === myOpenid) {
          last = it; break;
        }
      }
      if (!last) return;
      try {
        await tableOrder.updateQty(tableOrder.getTableId(), last.uid, (last.qty || 1) - 1);
      } catch (err) {
        wx.showToast({ title: err.message || '操作失败', icon: 'none', duration: 1500 });
      }
      return;
    }

    const cartItems = app.globalData.cartItems.slice();
    // 找到最后一条该 id 的条目
    let lastIdx = -1;
    for (let i = cartItems.length - 1; i >= 0; i--) {
      if (cartItems[i].id === productId) { lastIdx = i; break; }
    }
    if (lastIdx < 0) return;
    if (cartItems[lastIdx].qty > 1) {
      cartItems[lastIdx].qty--;
    } else {
      cartItems.splice(lastIdx, 1);
    }
    app.globalData.cartItems = cartItems;
    this._refreshCartMap();
  },

  // 将商品加入购物车（桌位模式写共享桌单，否则写本地内存）
  async _addItemToCart(product, spec, orderType) {
    if (this.data.tableMode) {
      try {
        await tableOrder.addItem(tableOrder.getTableId(), {
          productId: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          category: product.category,
          spec: spec || ''
        });
        wx.showToast({ title: '已添加', icon: 'success', duration: 600 });
      } catch (err) {
        wx.showToast({ title: err.message || '添加失败', icon: 'none', duration: 1500 });
      }
      return;
    }

    const cartItems = app.globalData.cartItems.slice();
    // 同商品同规格同就餐方式才合并
    const existing = cartItems.find(i => i.id === product.id && i.spec === spec && i.orderType === orderType);
    if (existing) {
      existing.qty++;
    } else {
      cartItems.push({
        uid: `${product.id}_${spec}_${Date.now()}`,
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        category: product.category,
        spec: spec,
        orderType: orderType || '',
        qty: 1
      });
    }
    app.globalData.cartItems = cartItems;
    this._refreshCartMap();
    wx.showToast({ title: '已添加', icon: 'success', duration: 600 });
  },

  onCartTap() {
    wx.navigateTo({ url: '/pages/cart/cart' });
  },

  // 点击商品图片放大预览
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({
      current: url,
      urls: [url]
    });
  }
});
