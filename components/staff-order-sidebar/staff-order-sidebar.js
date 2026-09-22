// components/staff-order-sidebar/staff-order-sidebar.js
// 店员手动点单侧栏：复用前端点单能力（分类/温度/拼球/加料），确认下单走 recordManualOrder 记账（不支付）
const pay = require('../../utils/pay.js');
const { normalizeToppings } = require('../../utils/orderDisplay.js');
const specUtil = require('../../utils/orderSpec.js');

const ALL_CATEGORIES = [
  { id: 'coco', name: '可可' },
  { id: 'coffee', name: '咖啡' },
  { id: 'icecream', name: '冰淇淋' },
  { id: 'dessert', name: '甜点' },
  { id: 'bar', name: '巧克力排块' },
  { id: 'other', name: '无因饮品' }
];
const CATEGORY_ORDER = ['coco', 'coffee', 'icecream', 'dessert', 'bar', 'other'];

Component({
  properties: {
    // 编辑模式（由 staff 页传入，editOrderId 非空即编辑已有订单）
    editOrderId: { type: String, value: '' },
    editOrderType: { type: String, value: 'dine-in' },
    editRemark: { type: String, value: '' },
    editItems: { type: Array, value: [] }   // [{ productId, name, price(行总价), quantity, spec, temperature }]
  },

  data: {
    orderType: 'dine-in',   // 'dine-in' | 'takeaway'（侧栏内切换）
    isEdit: false,          // 是否编辑已有订单
    categories: ALL_CATEGORIES,
    allProducts: [],
    currentCategory: '',
    loading: true,

    cartItems: [],   // [{ uid, id, name, price(单件), image, category, spec, temperature, orderType, qty }]
    cartMap: {},     // { productId: totalQty }（仅统计当前 orderType，用于商品列表徽标与「−」）
    cartCount: 0,
    cartTypeCount: 1,  // 购物车内出现的类型数（>1 时下单拆两单，按钮显示提示）
    totalPrice: '0.00',
    cartListHeight: 0,   // 购物车清单滚动高度（按行数估算，封顶 160px）
    remark: '',

    // 规格弹窗
    showSpecModal: false,
    specModalProduct: null,
    specModalType: '',     // 'temp' | 'scoop' | 'none'
    specOptions: [],
    selectedSpec: '',
    scoopConfig: { single: 28, double: 38, triple: 45 },
    specScoopPrices: { single: 28, double: 38, triple: 45 },
    specFlavors: [],
    selectedScoopCount: 1,
    selectedScoopTotal: 0,
    specToppings: [],
    specToppingMode: 'multi',
    specTotalPrice: 0,
    scoopMixed: false
  },

  lifetimes: {
    attached() {
      this._loadProducts();
      // 编辑模式：预填购物车
      if (this.data.editOrderId) {
        const items = (this.data.editItems || []).map(it => ({
          uid: `${it.productId}_${it.spec}_${Date.now()}`,
          id: it.productId,
          name: it.name,
          price: it.quantity > 0 ? Math.round((Number(it.price) / it.quantity) * 100) / 100 : (Number(it.price) || 0),
          image: '',
          category: '',
          spec: it.spec || '',
          temperature: it.temperature || '',
          orderType: this.data.editOrderType || 'dine-in',
          qty: it.quantity || 1
        }));
        this.setData({
          isEdit: true,
          orderType: this.data.editOrderType || 'dine-in',
          remark: this.data.editRemark || '',
          cartItems: items
        }, () => this._refreshCart());
      }
    }
  },

  methods: {
    _cacheGet(key) {
      try {
        const raw = wx.getStorageSync(key);
        if (raw && raw.time && (Date.now() - raw.time < 15 * 60 * 1000)) return raw.data;
      } catch (e) { /* 忽略 */ }
      return null;
    },
    _cacheSet(key, data) {
      try { wx.setStorageSync(key, { time: Date.now(), data }); } catch (e) { /* 忽略 */ }
    },

    _loadProducts() {
      this.setData({ loading: true });
      const cached = this._cacheGet('_cache_products');
      if (cached) {
        this.setData({
          allProducts: cached.sortedProducts || [],
          categories: (cached.categories && cached.categories.length) ? cached.categories : ALL_CATEGORIES,
          currentCategory: (cached.categories && cached.categories.length) ? cached.categories[0].id : '',
          scoopConfig: cached.scoopConfig || this.data.scoopConfig,
          loading: false
        });
      }

      wx.cloud.callFunction({ name: 'initDB', data: { action: 'getProducts' } })
        .then(res => {
          const all = (res.result && res.result.data) || [];
          const scoopConfig = (res.result && res.result.scoopConfig) || { single: 28, double: 38, triple: 45 };
          const products = all
            .filter(p => p.saleStatus === 'on')
            .map(p => {
              const legacy = p.supportIceHot || false;
              const scoopEnabled = !!p.scoopEnabled;
              const scoopOptions = p.scoopOptions || [];
              const isScoopable = p.category === 'icecream' && scoopOptions.length > 0;
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
                scoopPrices: isScoopable ? effectivePrices : null,
                image: p.imageURL || p.image || '',
                supportIce: p.supportIce !== undefined ? p.supportIce : legacy,
                supportHot: p.supportHot !== undefined ? p.supportHot : legacy,
                supportNormal: p.supportNormal || false,
                scoopOptions: scoopOptions,
                scoopEnabled: scoopEnabled,
                flavorTags: (p.flavors || '').split(/[;；,，]/).map(s => s.trim()).filter(Boolean),
                toppings: normalizeToppings(p.toppings),
                toppingMode: p.toppingMode === 'single' ? 'single' : 'multi',
                roastLevel: p.roastLevel || '',
                processingMethod: p.processingMethod || ''
              };
            });

          const catIds = [...new Set(products.map(p => p.categoryId))];
          const categories = ALL_CATEGORIES.filter(c => catIds.includes(c.id));
          const sortedProducts = products.slice().sort((a, b) =>
            CATEGORY_ORDER.indexOf(a.categoryId) - CATEGORY_ORDER.indexOf(b.categoryId));

          this.setData({
            allProducts: sortedProducts,
            categories,
            currentCategory: categories.length ? categories[0].id : '',
            scoopConfig,
            loading: false
          });
          this._cacheSet('_cache_products', { categories, sortedProducts, scoopConfig });
        })
        .catch(e => {
          console.warn('[StaffOrderSidebar] 加载商品失败', e);
          this.setData({ loading: false });
        });
    },

    onCategoryChange(e) {
      this.setData({ currentCategory: e.currentTarget.dataset.id });
    },

    onSelectOrderType(e) {
      this.setData({ orderType: e.currentTarget.dataset.type }, () => this._refreshCart());
    },

    // 点击「+」：判断是否需要弹规格窗
    onAddToCart(e) {
      const productId = e.currentTarget.dataset.id;
      const product = this.data.allProducts.find(p => p.id === productId);
      if (!product) return;

      const isIcecream = product.category === 'icecream';
      const isScoopable = isIcecream && product.scoopOptions && product.scoopOptions.length > 0;
      const hasToppings = !!(product.toppings && product.toppings.length > 0);

      const tempOptions = [];
      if (!isIcecream) {
        if (product.supportIce) tempOptions.push('冰');
        if (product.supportHot) tempOptions.push('热');
        if (product.supportNormal) tempOptions.push('常温');
      }

      const hasSpec = isScoopable || tempOptions.length > 0 || hasToppings;
      if (hasSpec) {
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
            scoopMixed: false  // 非拼球弹窗必须复位，否则上次拼球残留的 scoopMixed 会隐藏加料
          });
        }
        this._refreshSpecTotal();
        return;
      }

      // 无需选规格，直接加入购物车（冰淇淋默认冰）
      this._addItemToCart(product, isIcecream ? '冰' : '', undefined, isIcecream ? '冰' : '');
    },

    _openScoopModal(product) {
      const ORDER = ['单球', '双球', '三球'];
      const options = (product.scoopOptions || [])
        .filter(o => ORDER.includes(o))
        .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
      const firstSpec = options.includes('单球') ? '单球' : options[0];
      const firstCount = firstSpec === '单球' ? 1 : firstSpec === '双球' ? 2 : 3;
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
        scoopMixed: false
      });
      this._refreshSpecTotal();
    },

    onSelectSpec(e) {
      const val = e.currentTarget.dataset.val;
      const scoopCount = val === '单球' ? 1 : val === '双球' ? 2 : val === '三球' ? 3 : 0;
      const anchorId = this.data.specModalProduct && this.data.specModalProduct.id;
      const flavors = this.data.specFlavors.slice();
      let total = flavors.reduce((s, f) => s + (f.qty || 0), 0);
      const trim = (f) => {
        while (f.qty > 0 && total > scoopCount) { f.qty -= 1; total -= 1; }
      };
      for (let i = flavors.length - 1; i >= 0 && total > scoopCount; i--) {
        if (flavors[i].id === anchorId) continue;
        trim(flavors[i]);
      }
      for (let i = 0; i < flavors.length && total > scoopCount; i++) {
        if (flavors[i].id === anchorId) trim(flavors[i]);
      }
      this.setData({ selectedSpec: val, selectedScoopCount: scoopCount, specFlavors: flavors, selectedScoopTotal: total });
      this._updateScoopToppingVisibility();
    },

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

    onDecFlavor(e) {
      const index = e.currentTarget.dataset.index;
      const flavors = this.data.specFlavors.slice();
      const flavor = flavors[index];
      if (!flavor || flavor.qty <= 0) return;
      const anchorId = this.data.specModalProduct && this.data.specModalProduct.id;
      if (flavor.id === anchorId && flavor.qty <= 1) {
        wx.showToast({ title: '当前口味不可删除', icon: 'none', duration: 1500 });
        return;
      }
      flavor.qty -= 1;
      this.setData({ specFlavors: flavors, selectedScoopTotal: this.data.selectedScoopTotal - 1 });
      this._updateScoopToppingVisibility();
    },

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

    onDecTopping(e) {
      const idx = e.currentTarget.dataset.index;
      const list = this.data.specToppings.slice();
      const item = list[idx];
      if (!item || (item.qty || 0) <= 0) return;
      item.qty = (item.qty || 0) - 1;
      this.setData({ specToppings: list });
      this._refreshSpecTotal();
    },

    _scoopUnitPrice(spec) {
      return specUtil.scoopUnitPrice(spec, this.data.selectedSpec, this.data.specScoopPrices, this.data.scoopConfig);
    },

    _selectedToppingsTotal() {
      return specUtil.selectedToppingsTotal(this.data.specToppings);
    },

    _baseUnitPrice() {
      return specUtil.baseUnitPrice(this.data);
    },

    _refreshSpecTotal() {
      const total = specUtil.specTotalPrice(this.data);
      this.setData({ specTotalPrice: total });
      return total;
    },

    _updateScoopToppingVisibility() {
      this.setData(specUtil.resolveScoopToppingVisibility(this.data));
      this._refreshSpecTotal();
    },

    _appendToppings(base) {
      return specUtil.appendToppings(this.data.specToppings, base);
    },

    _buildScoopSpec() {
      return specUtil.buildScoopSpec(this.data.selectedSpec, this.data.specFlavors, this.data.specToppings);
    },

    onConfirmSpec() {
      const { specModalProduct, selectedSpec, specModalType } = this.data;
      if (!specModalProduct) return;
      if (specModalType !== 'none' && !selectedSpec) {
        wx.showToast({ title: '请选择规格', icon: 'none', duration: 1500 });
        return;
      }
      if (specModalType === 'scoop') {
        const count = this.data.selectedScoopCount || 1;
        if (this.data.selectedScoopTotal !== count) {
          wx.showToast({ title: `请选择 ${count} 球`, icon: 'none', duration: 1500 });
          return;
        }
        const spec = this._buildScoopSpec();
        this.setData({ showSpecModal: false });
        const scoopUnitPrice = Math.round((this._scoopUnitPrice(selectedSpec) + this._selectedToppingsTotal()) * 100) / 100;
        this._addItemToCart(specModalProduct, spec, scoopUnitPrice, '冰');
        return;
      }
      this.setData({ showSpecModal: false });
      const unitPrice = Math.round((this._baseUnitPrice() + this._selectedToppingsTotal()) * 100) / 100;
      this._addItemToCart(specModalProduct, this._appendToppings(''), unitPrice, selectedSpec);
    },

    onCancelSpec() {
      this.setData({ showSpecModal: false });
    },

    _addItemToCart(product, spec, price, temperature) {
      const unitPrice = price !== undefined ? price : product.price;
      const orderType = this.data.orderType || 'dine-in';
      const cartItems = this.data.cartItems.slice();
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
          spec: spec || '',
          temperature: temperature || '',
          orderType,
          qty: 1
        });
      }
      this.setData({ cartItems }, () => this._refreshCart());
      wx.showToast({ title: '已添加', icon: 'success', duration: 600 });
    },

    onRemoveFromCart(e) {
      const productId = e.currentTarget.dataset.id;
      const orderType = this.data.orderType || 'dine-in';
      const cartItems = this.data.cartItems.slice();
      let lastIdx = -1;
      for (let i = cartItems.length - 1; i >= 0; i--) {
        if (cartItems[i].id === productId && cartItems[i].orderType === orderType) { lastIdx = i; break; }
      }
      if (lastIdx < 0) return;
      if (cartItems[lastIdx].qty > 1) cartItems[lastIdx].qty--;
      else cartItems.splice(lastIdx, 1);
      this.setData({ cartItems }, () => this._refreshCart());
    },

    _refreshCart() {
      // 每行附 lineTotal（单价×数量，toFixed 防浮点），WXML 直接相乘会显示 59.6999... 这类金额
      const items = (this.data.cartItems || []).map(i => ({
        ...i,
        lineTotal: ((Number(i.price) || 0) * i.qty).toFixed(2)
      }));
      const orderType = this.data.orderType || 'dine-in';
      // 商品列表徽标/「−」只统计当前类型；结算总额与清单高度统计全部条目
      const cartMap = {};
      let total = 0;
      items.forEach(i => {
        if (i.orderType === orderType) {
          cartMap[i.id] = (cartMap[i.id] || 0) + i.qty;
        }
        total += i.qty;
      });
      const totalPrice = items
        .reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0)
        .toFixed(2);
      const cartTypeCount = new Set(items.map(i => i.orderType === 'takeaway' ? 'takeaway' : 'dine-in')).size;
      // 清单高度按行估算（含规格/温度的行更高），封顶 160px 后滚动，避免覆盖备注栏
      const cartListHeight = Math.min(
        items.reduce((h, i) => h + (i.spec || i.temperature ? 48 : 32), 0),
        160
      );
      this.setData({ cartItems: items, cartMap, cartCount: total, cartTypeCount, totalPrice, cartListHeight });
    },

    onRemarkInput(e) {
      this.setData({ remark: e.detail.value });
    },

    onClose() {
      this.triggerEvent('close');
    },

    onSubmit() {
      const items = this.data.cartItems;
      if (!items.length) {
        wx.showToast({ title: '请先添加商品', icon: 'none', duration: 1500 });
        return;
      }
      const orderType = this.data.orderType || 'dine-in';
      const remark = this.data.remark || '';
      const mapItem = i => ({
        id: i.id,
        name: i.name,
        price: i.price,
        qty: i.qty,
        spec: i.spec,
        temperature: i.temperature
      });
      const done = () => {
        this.setData({ cartItems: [], remark: '' }, () => this._refreshCart());
        this.triggerEvent('done');
      };
      if (this.data.isEdit && this.data.editOrderId) {
        // 编辑：已有订单为单一类型，整单保持原类型
        const group = { items: items.map(mapItem), orderType, remark };
        pay.updateManualOrder(this.data.editOrderId, group, done);
      } else {
        // 新建：按类型拆单（堂食/外带各成一单，各占一个取餐号）
        const byType = { 'dine-in': [], 'takeaway': [] };
        items.forEach(i => {
          const t = i.orderType === 'takeaway' ? 'takeaway' : 'dine-in';
          byType[t].push(i);
        });
        const groups = ['dine-in', 'takeaway']
          .filter(t => byType[t].length > 0)
          .map(t => ({ items: byType[t].map(mapItem), orderType: t, remark }));
        pay.recordManualOrder(groups, done);
      }
    }
  },
});
