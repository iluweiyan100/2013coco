// order.js
const app = getApp();
const pay = require('../../utils/pay.js');
const tableOrder = require('../../utils/tableOrder.js');
const { normalizeToppings } = require('../../utils/orderDisplay.js');
const specUtil = require('../../utils/orderSpec.js');

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
      { id: 'other',    name: '无因饮品' }
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

    // 拼球（冰淇淋）：全局价格 + 口味选择
    scoopConfig: { single: 28, double: 38, triple: 45 },
    specScoopPrices: { single: 28, double: 38, triple: 45 }, // 当前弹窗商品的生效拼球价（单独定价时用商品价）
    specFlavors: [],          // 可拼球口味列表 [{ id, name, qty }]
    selectedScoopCount: 1,    // 当前球数（1/2/3）
    selectedScoopTotal: 0,    // 已选总球数（各口味 qty 之和）
    specToppings: [],         // 其他可选（加料）[{ name, price, qty }]
    specToppingMode: 'multi', // 加料选择方式 single | multi
    specTotalPrice: 0,        // 弹窗实时合计（基础价 + 已选加料）
    scoopMixed: false,        // 拼球是否混入其他口味（多口味拼球隐藏加料）

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
        scoopConfig: cached.scoopConfig || this.data.scoopConfig,
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
    clearTimeout(this._scrollLockTimer);
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
      const scoopConfig = (res.result && res.result.scoopConfig) || { single: 28, double: 38, triple: 45 };
      const products = all
        .filter(p => p.saleStatus === 'on')
        .map(p => {
          // 兼容旧 supportIceHot 字段
          const legacy = p.supportIceHot || false;
          const scoopEnabled = !!p.scoopEnabled;
          const scoopOptions = p.scoopOptions || [];
          const isScoopable = p.category === 'icecream' && scoopOptions.length > 0;
          // 生效拼球价：默认全局；单独定价商品用其自定义价覆盖（仅取 >0 的有效值，空缺回退全局）
          const effectivePrices = {
            single: scoopConfig.single !== undefined ? scoopConfig.single : 28,
            double: scoopConfig.double !== undefined ? scoopConfig.double : 38,
            triple: scoopConfig.triple !== undefined ? scoopConfig.triple : 45
          };
          if (p.scoopPriceMode === 'custom' && p.scoopPrices) {
            ['single', 'double', 'triple'].forEach(k => {
              const v = Number(p.scoopPrices[k]);
              if (!isNaN(v) && v > 0) effectivePrices[k] = v;
            });
          }
          // 卡片价格 = 勾选球数里的最低价（未勾选的球数不计入）
          let minScoopPrice = null;
          if (isScoopable) {
            const KEYS = { '单球': 'single', '双球': 'double', '三球': 'triple' };
            scoopOptions.forEach(o => {
              const k = KEYS[o];
              if (!k) return;
              const v = Number(effectivePrices[k]);
              if (!isNaN(v) && (minScoopPrice === null || v < minScoopPrice)) minScoopPrice = v;
            });
          }
          return {
            ...p,
            id: p._id,
            categoryId: p.category,
            categoryName: p.categoryLabel,
            price: isScoopable ? (minScoopPrice != null ? minScoopPrice : effectivePrices.single) : Number(p.price),
            // 拼球生效价（已按商品自定义价覆盖，拼球弹窗计价用）
            scoopPrices: isScoopable ? effectivePrices : null,
            image: p.imageURL || p.image || '',
            supportIce: p.supportIce !== undefined ? p.supportIce : legacy,
            supportHot: p.supportHot !== undefined ? p.supportHot : legacy,
            supportNormal: p.supportNormal || false,
            scoopOptions: scoopOptions,
            scoopEnabled: scoopEnabled,
            // 冰淇淋风味标签（; 分隔，卡片展示用）
            flavorTags: (p.flavors || '').split(/[;；,，]/).map(s => s.trim()).filter(Boolean),
            // 其他可选（加料）：材料名列表 + 单选/多选
            toppings: normalizeToppings(p.toppings),
            toppingMode: p.toppingMode === 'single' ? 'single' : 'multi',
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
        scoopConfig,
        loading: false
      });
      this._refreshCartMap();
      this._measureCategoryPositions();

      // 缓存商品数据（15分钟有效，减少云端请求）
      this._cacheSet('_cache_products', { categories, sortedProducts, scoopConfig });

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
    // 锁定，避免程序滚动触发 onProductScroll 回写旧高亮
    this._scrollLock = true;
    clearTimeout(this._scrollLockTimer);
    this._scrollLockTimer = setTimeout(() => { this._scrollLock = false; }, 600);
    // 先重置再赋值，规避 scroll-into-view 同值不滚动
    this.setData({ scrollToView: '' }, () => {
      this.setData({ scrollToView: `category-${categoryId}` });
    });
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
    if (this._scrollLock) return;   // 程序滚动期间不联动
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

  // 滚动到底部：点亮最后一个分类（末分类标题到不了顶部，需兜底）
  onProductScrollToLower() {
    const positions = this.data.categoryPositions;
    if (positions && positions.length > 0) {
      const last = positions[positions.length - 1].id;
      if (last !== this.data.currentCategory) {
        this.setData({ currentCategory: last });
      }
    }
  },

  // 点击「+」：判断是否需要弹规格窗
  onAddToCart(e) {
    const productId = e.currentTarget.dataset.id;
    const product = this.data.allProducts.find(p => p.id === productId);
    if (!product) return;

    const isIcecream = product.category === 'icecream';
    const isScoopable = isIcecream && product.scoopOptions && product.scoopOptions.length > 0;
    const hasToppings = !!(product.toppings && product.toppings.length > 0);

    // 冰淇淋默认冰，不弹温度弹窗；非冰淇淋才构建温度选项
    const tempOptions = [];
    if (!isIcecream) {
      if (product.supportIce) tempOptions.push('冰');
      if (product.supportHot) tempOptions.push('热');
      if (product.supportNormal) tempOptions.push('常温');
    }

    const hasSpec = isScoopable || tempOptions.length > 0 || hasToppings;

    // 有规格/加料 或 未确定就餐方式 → 打开弹窗
    if (hasSpec || !this.data.orderType) {
      if (isScoopable) {
        this._openScoopModal(product);
      } else {
        this.setData({
          showSpecModal: true,
          specModalProduct: product,
          specModalType: tempOptions.length > 0 ? 'temp' : 'none',
          specOptions: tempOptions,
          selectedSpec: tempOptions.length > 0 ? tempOptions[0] : '',
          specToppings: (product.toppings || []).map(t => ({ ...t, qty: 0 })),
          specToppingMode: product.toppingMode === 'single' ? 'single' : 'multi',
          scoopMixed: false,  // 非拼球弹窗必须复位，否则上次拼球残留的 scoopMixed 会隐藏加料
          selectedOrderType: this.data.orderType  // 首页传入则预选
        });
        this._refreshSpecTotal();
      }
      return;
    }

    // 无需选规格 + 已知就餐方式，直接加入购物车（冰淇淋默认冰）
    this._addItemToCart(product, isIcecream ? '冰' : '', this.data.orderType, undefined, isIcecream ? '冰' : '');
  },

  // 打开拼球规格弹窗（冰淇淋可拼球商品）
  _openScoopModal(product) {
    const ORDER = ['单球', '双球', '三球'];
    const options = (product.scoopOptions || [])
      .filter(o => ORDER.includes(o))
      .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    // 默认球数跟随首个勾选项（不再硬编码单球）
    const firstSpec = options.includes('单球') ? '单球' : options[0];
    const firstCount = firstSpec === '单球' ? 1 : firstSpec === '双球' ? 2 : 3;
    // 口味列表 = 当前商品（恒可选，支持同商品多球）
    // + 所有「可拼球」商品。仅当当前商品本身「可作为拼球口味」时，才展示其他可拼球口味；
    // 否则（未勾选「可作为拼球口味」）只保留当前商品，不出现其他可拼球选项。
    const flavors = this.data.allProducts
      .filter(p => {
        if (p.category !== 'icecream') return false;
        if (p.id === product.id) return true;
        return product.scoopEnabled && p.scoopEnabled;
      })
      .map(p => ({ id: p.id, name: p.name, qty: p.id === product.id ? firstCount : 0 }));
    this.setData({
      showSpecModal: true,
      specModalProduct: product,
      specModalType: 'scoop',
      specOptions: options,
      specScoopPrices: product.scoopPrices || this.data.scoopConfig,
      selectedSpec: firstSpec,
      specFlavors: flavors,
      selectedScoopCount: firstCount,
      selectedScoopTotal: firstCount,
      specToppings: (product.toppings || []).map(t => ({ ...t, qty: 0 })),
      specToppingMode: product.toppingMode === 'single' ? 'single' : 'multi',
      scoopMixed: false,
      selectedOrderType: this.data.orderType
    });
    this._refreshSpecTotal();
  },

  // 规格弹窗：选择规格（温度 / 球数）—— 切球数保留已选口味，超上限时先削减非锚点商品
  onSelectSpec(e) {
    const val = e.currentTarget.dataset.val;
    const scoopCount = val === '单球' ? 1 : val === '双球' ? 2 : val === '三球' ? 3 : 0;
    const anchorId = this.data.specModalProduct && this.data.specModalProduct.id;
    const flavors = this.data.specFlavors.slice();
    let total = flavors.reduce((s, f) => s + (f.qty || 0), 0);
    const trim = (f) => {
      while (f.qty > 0 && total > scoopCount) {
        f.qty -= 1;
        total -= 1;
      }
    };
    // 第一遍：从末尾往前削减非锚点口味，优先保留进入弹窗的初始商品
    for (let i = flavors.length - 1; i >= 0 && total > scoopCount; i--) {
      if (flavors[i].id === anchorId) continue;
      trim(flavors[i]);
    }
    // 第二遍：仍超限（只剩锚点有球）时削减锚点
    for (let i = 0; i < flavors.length && total > scoopCount; i++) {
      if (flavors[i].id === anchorId) trim(flavors[i]);
    }
    this.setData({
      selectedSpec: val,
      selectedScoopCount: scoopCount,
      specFlavors: flavors,
      selectedScoopTotal: total
    });
    this._updateScoopToppingVisibility();
  },

  // 规格弹窗：某口味 +1 球
  onIncFlavor(e) {
    const index = e.currentTarget.dataset.index;
    const flavors = this.data.specFlavors.slice();
    const flavor = flavors[index];
    if (!flavor) return;
    const count = this.data.selectedScoopCount || 1;
    if (this.data.selectedScoopTotal >= count) {
      wx.showToast({ title: `已选满 ${count} 球`, icon: 'none', duration: 1500 });
      return;
    }
    flavor.qty += 1;
    this.setData({ specFlavors: flavors, selectedScoopTotal: this.data.selectedScoopTotal + 1 });
    this._updateScoopToppingVisibility();
  },

  // 规格弹窗：某口味 -1 球
  onDecFlavor(e) {
    const index = e.currentTarget.dataset.index;
    const flavors = this.data.specFlavors.slice();
    const flavor = flavors[index];
    if (!flavor || flavor.qty <= 0) return;
    const anchorId = this.data.specModalProduct && this.data.specModalProduct.id;
    // 当前商品口味为锚点，不可删除，至少保留 1 球
    if (flavor.id === anchorId && flavor.qty <= 1) {
      wx.showToast({ title: '当前口味不可删除', icon: 'none', duration: 1500 });
      return;
    }
    flavor.qty -= 1;
    this.setData({ specFlavors: flavors, selectedScoopTotal: this.data.selectedScoopTotal - 1 });
    this._updateScoopToppingVisibility();
  },

  // 规格弹窗：加料 +1 份。单选=互斥（选其他项则清空前者），多选=各计份数；每项最多 3 份
  onIncTopping(e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.specToppings.slice();
    const item = list[idx];
    if (!item) return;
    if ((item.qty || 0) >= 3) {
      wx.showToast({ title: '每项最多 3 份', icon: 'none', duration: 1500 });
      return;
    }
    if (this.data.specToppingMode === 'single') {
      list.forEach(t => { if (t !== item) t.qty = 0; });
    }
    item.qty = (item.qty || 0) + 1;
    this.setData({ specToppings: list });
    this._refreshSpecTotal();
  },

  // 规格弹窗：加料 -1 份
  onDecTopping(e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.specToppings.slice();
    const item = list[idx];
    if (!item || (item.qty || 0) <= 0) return;
    item.qty = (item.qty || 0) - 1;
    this.setData({ specToppings: list });
    this._refreshSpecTotal();
  },

  // 按球数返回单件价
  _scoopUnitPrice(spec) {
    return specUtil.scoopUnitPrice(spec, this.data.selectedSpec, this.data.specScoopPrices, this.data.scoopConfig);
  },

  // 已选加料价格合计（元）= Σ(单价 × 份数)
  _selectedToppingsTotal() {
    return specUtil.selectedToppingsTotal(this.data.specToppings);
  },

  // 当前基础单价：拼球按球数价，其余按商品价
  _baseUnitPrice() {
    return specUtil.baseUnitPrice(this.data);
  },

  // 刷新弹窗实时合计 = 基础价 + 已选加料
  _refreshSpecTotal() {
    const total = specUtil.specTotalPrice(this.data);
    this.setData({ specTotalPrice: total });
    return total;
  },

  // 拼球：单口味多球显示加料，多口味拼球隐藏加料并清空已选
  _updateScoopToppingVisibility() {
    this.setData(specUtil.resolveScoopToppingVisibility(this.data));
    this._refreshSpecTotal();
  },

  // 把已选加料拼到规格文字末尾，如「 +奥利奥碎×2+坚果」（份数 1 时省略 ×1）
  _appendToppings(base) {
    return specUtil.appendToppings(this.data.specToppings, base);
  },

  // 拼出拼球规格字符串，如「双球：香草×1+巧克力×1」「三球：香草×2+巧克力×1」，追加已选加料
  _buildScoopSpec() {
    return specUtil.buildScoopSpec(this.data.selectedSpec, this.data.specFlavors, this.data.specToppings);
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

    // 拼球：校验已选总球数 == 球数，按球数计价，默认冰
    if (specModalType === 'scoop') {
      const count = this.data.selectedScoopCount || 1;
      if (this.data.selectedScoopTotal !== count) {
        wx.showToast({ title: `请选择 ${count} 球`, icon: 'none', duration: 1500 });
        return;
      }
      const spec = this._buildScoopSpec();
      this.setData({ showSpecModal: false });
      const scoopUnitPrice = Math.round((this._scoopUnitPrice(selectedSpec) + this._selectedToppingsTotal()) * 100) / 100;
      this._addItemToCart(specModalProduct, spec, selectedOrderType, scoopUnitPrice, '冰', this.data.selectedScoopCount);
      return;
    }

    this.setData({ showSpecModal: false });
    // spec 只存加料（温度由 temperature 字段单独承载，避免重复存储「热 +奥利奥碎」）
    const unitPrice = Math.round((this._baseUnitPrice() + this._selectedToppingsTotal()) * 100) / 100;
    this._addItemToCart(specModalProduct, this._appendToppings(''), selectedOrderType, unitPrice, selectedSpec);
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

    let price = Math.round((this._baseUnitPrice() + this._selectedToppingsTotal()) * 100) / 100;
    let spec = selectedSpec;
    let temperature = '';
    if (specModalType === 'scoop') {
      const count = this.data.selectedScoopCount || 1;
      if (this.data.selectedScoopTotal !== count) {
        wx.showToast({ title: `请选择 ${count} 球`, icon: 'none', duration: 1500 });
        return;
      }
      spec = this._buildScoopSpec();
      temperature = '冰';
    } else {
      // spec 只存加料，温度由 temperature 单独承载
      spec = this._appendToppings('');
      temperature = selectedSpec;
    }

    // 关闭弹窗，调起支付
    this.setData({ showSpecModal: false });
    pay.pay({
      orderGroups: [{
        items: [{
          id: specModalProduct.id,
          name: specModalProduct.name,
          price: price,
          qty: 1,
          spec: spec,
          temperature: temperature
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
  // price：单件价（拼球传球数价）；temperature：冰淇淋固定「冰」；scoopCount：球数（1/2/3）
  async _addItemToCart(product, spec, orderType, price, temperature, scoopCount) {
    const unitPrice = price !== undefined ? price : product.price;
    if (this.data.tableMode) {
      try {
        await tableOrder.addItem(tableOrder.getTableId(), {
          productId: product.id,
          name: product.name,
          price: unitPrice,
          image: product.image,
          category: product.category,
          spec: spec || '',
          temperature: temperature || '',
          scoopCount: scoopCount || 0
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
        price: unitPrice,
        image: product.image,
        category: product.category,
        spec: spec,
        temperature: temperature || '',
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
