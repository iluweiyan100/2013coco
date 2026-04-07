// order.js
Page({
  data: {
    currentCategory: 'cocoa',
    categories: [
      { id: 'cocoa', name: '可可' },
      { id: 'coffee', name: '咖啡' },
      { id: 'icecream', name: '冰淇淋' },
      { id: 'caffeine-free', name: '无咖啡因饮品' }
    ],
    // 所有商品列表（平铺结构，包含分类标识）
    allProducts: [
      // 可分类
      {
        id: 1,
        categoryId: 'cocoa',
        categoryName: '可可',
        name: '经典热可可',
        description: '可选冰/热',
        price: 28,
        image: '/images/products/cocoa1.jpg'
      },
      {
        id: 2,
        categoryId: 'cocoa',
        categoryName: '可可',
        name: '榛子可可',
        description: '可选冰/热',
        price: 32,
        image: '/images/products/cocoa2.jpg'
      },
      {
        id: 3,
        categoryId: 'cocoa',
        categoryName: '可可',
        name: '白巧克力可可',
        description: '可选冰/热',
        price: 32,
        image: '/images/products/cocoa3.jpg'
      },
      // 咖啡类
      {
        id: 4,
        categoryId: 'coffee',
        categoryName: '咖啡',
        name: '美式咖啡',
        description: '可选冰/热',
        price: 25,
        image: '/images/products/coffee1.jpg'
      },
      {
        id: 5,
        categoryId: 'coffee',
        categoryName: '咖啡',
        name: '拿铁咖啡',
        description: '可选冰/热',
        price: 30,
        image: '/images/products/coffee2.jpg'
      },
      // 冰淇淋类
      {
        id: 6,
        categoryId: 'icecream',
        categoryName: '冰淇淋',
        name: '香草冰淇淋',
        description: '单球/双球',
        price: 22,
        image: '/images/products/icecream1.jpg'
      },
      // 无咖啡因类
      {
        id: 7,
        categoryId: 'caffeine-free',
        categoryName: '无咖啡因饮品',
        name: '抹茶拿铁',
        description: '可选冰/热',
        price: 28,
        image: '/images/products/matcha.jpg'
      }
    ]
  },

  onLoad(options) {
    // 获取传递的参数（堂食/外带）
    const type = options.type || 'dine-in';
    
    this.setData({
      orderType: type
    });
  },

  // 根据分类 ID 获取分类名称
  getCategoryName(categoryId) {
    const category = this.data.categories.find(cat => cat.id === categoryId);
    return category ? category.name : '';
  },

  // 切换分类 - 滚动到对应位置
  onCategoryChange(e) {
    const categoryId = e.currentTarget.dataset.id;
    
    this.setData({
      currentCategory: categoryId
    });

    // 查找该分类第一个商品的位置索引
    const targetIndex = this.data.allProducts.findIndex(
      product => product.categoryId === categoryId
    );

    if (targetIndex !== -1) {
      // 使用 scroll-into-view 滚动到对应商品
      this.setData({
        scrollToView: `product-${targetIndex}`
      });
    }
  },

  // 添加到购物车
  onAddToCart(e) {
    const productId = e.currentTarget.dataset.id;
    
    wx.showToast({
      title: '已添加',
      icon: 'success',
      duration: 1000
    });
    
    // TODO: 实现购物车逻辑
  }
});
