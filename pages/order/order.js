// order.js
const app = getApp();

Page({
  data: {
    currentCategory: '',
    cartCount: 0,
    cartMap: {},   // { productId: totalQty }
    categories: [
      { id: 'coco',     name: '可可' },
      { id: 'coffee',   name: '咖啡' },
      { id: 'icecream', name: '冰淇淋' },
      { id: 'other',    name: '无咖啡因饮品' }
    ],
    allProducts: [],
    loading: true,
    scrollToView: '',

    // 就餐方式（从首页传入，可能为空需在弹窗手动选）
    orderType: '',            // 'dine-in' | 'takeaway' | ''

    // 规格选择小浮窗
    showSpecModal: false,
    specModalProduct: null,   // 当前选规格的商品
    specModalType: '',        // 'temp' | 'scoop'
    specOptions: [],          // 当前弹窗的选项列表
    selectedSpec: '',         // 已选择的规格值
    selectedOrderType: ''     // 弹窗内选择的就餐方式（初始由 orderType 带入）
  },

  onLoad(options) {
    const type = options.type || '';  // 首页未传则为空
    this.setData({ orderType: type });
    this._loadProducts();
  },

  onShow() {
    this._refreshCartMap();
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
            scoopOptions: p.scoopOptions || []
          };
        });

      const catIds = [...new Set(products.map(p => p.categoryId))];
      const categories = this.data.categories.filter(c => catIds.includes(c.id));

      this.setData({
        allProducts: products,
        categories,
        currentCategory: categories.length > 0 ? categories[0].id : '',
        loading: false
      });
      this._refreshCartMap();
    } catch (e) {
      console.warn('[Order] 加载商品失败', e);
      this.setData({ loading: false });
    }
  },

  // 从 globalData.cartItems 重建 cartMap 和 cartCount
  _refreshCartMap() {
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
      this.setData({
        showSpecModal: true,
        specModalProduct: product,
        specModalType: isScoop ? 'scoop' : (tempOptions.length > 0 ? 'temp' : 'none'),
        specOptions: isScoop ? sortedScoop : tempOptions,
        selectedSpec: isScoop ? (sortedScoop.includes('单球') ? '单球' : sortedScoop[0]) : (tempOptions.length > 0 ? tempOptions[0] : ''),
        selectedOrderType: this.data.orderType  // 首页传入则预选
      });
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

  // 规格弹窗：取消
  onCancelSpec() {
    this.setData({ showSpecModal: false });
  },

  // 点击「-」：减少购物车中该商品数量（按 id 减，不区分规格，减最后一条）
  onRemoveFromCart(e) {
    const productId = e.currentTarget.dataset.id;
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

  // 将商品加入 globalData.cartItems
  _addItemToCart(product, spec, orderType) {
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
  }
});
