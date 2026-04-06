# 订单历史页面 (Orders)

## 📄 页面说明

订单历史页面展示用户的所有订单记录，包括当前进行中的订单和已完成的历史订单。

## 🎨 设计稿

Figma 设计稿地址：https://www.figma.com/design/AXqtqv0MFDWjgG4btMJtn9/2013coco?node-id=2-3&m=dev

## 📐 页面结构

### 1. 顶部导航栏
- 标题："我的订单"（居中）
- 使用自定义 navigation-bar 组件

### 2. 当前订单状态区
- **背景**: 红色到金棕色渐变 (#A3212D → #C08A4D)
- **内容**:
  - "您的订单" 标签
  - 取餐号（大号字体，72rpx）
  - 订单状态（制作中/待取餐等）

### 3. Tab 切换区
- **样式**: 圆角容器，米色背景 (#E8DCD1)
- **Tab 项**:
  - 全部
  - 待使用（制作中 + 待取餐）
  - 已完成
- **选中状态**: 红色背景 (#A3212D)，白色文字

### 4. 订单卡片列表
每个订单卡片包含：

#### 订单头部
- **左侧**:
  - 取餐号标签 + 取餐号值
  - 日期 + 时间 + 堂食/外带标签
- **右侧**:
  - 状态图标 + 状态文字

#### 商品列表
- 商品名称
- 规格选项（如：热/冷）
- 数量
- 价格

#### 合计
- "合计" 标签
- 总金额（金棕色 #C08A4D）

### 5. 底部 TabBar（自定义）
- **首页** - 跳转到首页
- **点单** - 跳转到点单页
- **订单** - 当前页面（高亮显示）
- **我的** - 跳转到个人中心

**样式规范**：
- 高度：128rpx（固定，不可修改）
- 背景：白色
- 图标：SVG 格式，通过 CSS filter 实现激活状态变色
- 位置：固定在底部，z-index: 100

### 6. 空状态
- 当没有订单时显示"暂无订单"

## 🔧 技术实现

### 数据过滤逻辑

```javascript
// 根据 Tab 类型过滤订单
updateFilteredOrders() {
  const { currentTab, orders } = this.data;
  let filtered = [];
  
  if (currentTab === 'all') {
    filtered = orders;
  } else if (currentTab === 'pending') {
    filtered = orders.filter(order => 
      order.status === 'making' || order.status === 'pending'
    );
  } else if (currentTab === 'completed') {
    filtered = orders.filter(order => order.status === 'completed');
  }
  
  this.setData({ filteredOrders: filtered });
}
```

### 底部 TabBar 切换逻辑

```javascript
// 底部 TabBar 切换
onBottomTabChange(e) {
  const tab = e.currentTarget.dataset.tab;
  
  // 如果点击的是当前页面，不做处理
  if (tab === 'orders') {
    return;
  }

  // 页面映射
  const pages = {
    'home': '/pages/index/index',
    'order': '/pages/order/order',
    'profile': '/pages/profile/profile'
  };

  // 跳转到对应页面
  if (pages[tab]) {
    wx.navigateTo({
      url: pages[tab]
    });
  }
}
```

### 订单数据结构

```javascript
{
  id: 1,                    // 订单ID
  pickupNumber: 'A05',      // 取餐号
  date: '04-03',            // 日期
  time: '17:31',            // 时间
  orderType: '堂食',         // 订单类型
  status: 'making',         // 状态码
  statusText: '制作中',      // 状态文本
  statusIcon: 'clock',      // 状态图标
  products: [               // 商品列表
    {
      name: '经典热可可',
      option: '热',
      quantity: 1,
      price: 28
    }
  ],
  totalAmount: 88           // 总金额
}
```

## 🎯 交互说明

### Tab 切换
1. 点击 Tab 项
2. 更新 `currentTab` 状态
3. 调用 `updateFilteredOrders()` 过滤订单
4. 页面重新渲染，显示过滤后的订单列表

### 底部导航
1. 点击底部 TabBar 图标
2. 判断是否为目标页面
3. 使用 `wx.navigateTo` 跳转
4. 当前页面不执行跳转

### 订单状态
- **making** (制作中): 显示时钟图标
- **pending** (待取餐): 显示购物袋图标
- **completed** (已完成): 显示对勾图标

## 📝 待办事项

- [ ] 从云数据库加载真实订单数据
- [ ] 添加订单详情跳转
- [ ] 添加下拉刷新功能
- [ ] 添加上拉加载更多
- [ ] 实现订单取消功能
- [ ] 添加订单评价功能
- [ ] 优化空状态UI（添加插图）

## 🔗 相关页面

- [点单页](../order/README.md) - 创建新订单
- [首页](../index/README.md) - 入口页面
- [个人中心](../profile/README.md) - 用户信息

## 📌 注意事项

1. **自定义 TabBar**: 使用与首页、点单页一致的自定义底部导航栏，不使用微信原生 TabBar
2. **数据来源**: 当前使用模拟数据，后续需对接云数据库
3. **状态管理**: 订单状态需要与后端保持同步
4. **性能优化**: 订单数量多时需要实现分页加载
5. **TabBar 高度**: 严格保持 128rpx，不得修改
6. **安全区域适配**: 已设置 `padding-bottom: env(safe-area-inset-bottom)` 适配不同机型
