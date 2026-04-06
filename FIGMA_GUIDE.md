# Figma 设计稿转小程序开发指南

## 📋 工作流程概览

```
Figma 设计稿 → 导出资源/获取样式 → VSCode 编写代码 → 微信开发者工具预览
```

## 🎨 方式一：手动转换（推荐，最灵活）

### 1. 准备工作

#### 在 Figma 中整理设计稿
- ✅ 使用 Frame 组织页面（每个页面对应小程序的一个 page）
- ✅ 使用规范的命名（如：`首页/index`, `菜单/menu`, `订单/order`）
- ✅ 创建颜色样式（Color Styles）和文本样式（Text Styles）
- ✅ 将可复用组件定义为 Component（如：按钮、卡片）

#### 在项目中创建目录结构
```
2013coco/
├── images/              # 存放从 Figma 导出的图片
│   ├── icons/          # 图标
│   ├── backgrounds/    # 背景图
│   └── products/       # 商品图片
├── pages/
│   ├── index/         # 首页（对应 Figma 的首页 Frame）
│   ├── menu/          # 菜单页
│   └── order/         # 订单页
└── components/         # 可复用组件（对应 Figma 的 Components）
```

### 2. 从 Figma 导出图片资源

**步骤：**
1. 在 Figma 中选中要导出的元素（图片、图标等）
2. 右侧面板找到 **Export** 区域
3. 点击 `+` 添加导出设置：
   - **格式选择**：
     - 图标/Logo：SVG（矢量，无损）或 PNG @2x/@3x
     - 商品图片：PNG 或 JPG（文件更小）
     - 背景图：JPG（如果不需要透明背景）
   - **尺寸选择**：
     - 小程序建议导出 @2x 或 @3x（适配高清屏）
4. 点击 **Export** 按钮
5. 保存到项目的 `images/` 目录

**微信小程序中使用：**
```xml
<!-- WXML -->
<image src="/images/logo.png" mode="aspectFit" class="logo"></image>
```

```wxss
/* WXSS */
.logo {
  width: 200rpx;
  height: 200rpx;
}
```

### 3. 从 Figma 获取样式代码

**步骤：**
1. 点击 Figma 右上角的 **Dev Mode** 开关（💡 图标）
2. 选中任意设计元素
3. 右侧面板会显示：
   - **CSS 代码**（需要转换为 WXSS）
   - **尺寸标注**（点击元素查看间距）
   - **颜色值**（十六进制或 RGB）
   - **字体样式**

**CSS 转 WXSS 对照表：**

| CSS 属性 | Figma 示例 | 转换后 WXSS | 说明 |
|---------|-----------|------------|------|
| `width` | `375px` | `750rpx` | px × 2 = rpx |
| `height` | `100px` | `200rpx` | px × 2 = rpx |
| `font-size` | `16px` | `32rpx` | px × 2 = rpx |
| `padding` | `20px` | `40rpx` | px × 2 = rpx |
| `margin` | `10px` | `20rpx` | px × 2 = rpx |
| `border-radius` | `8px` | `16rpx` | px × 2 = rpx |
| `background` | `#FF5722` | `#FF5722` | 保持不变 |
| `color` | `#333333` | `#333333` | 保持不变 |
| `box-shadow` | `0 4px 8px rgba(0,0,0,0.1)` | 不支持 | 改用图片模拟 |

**示例转换：**

```css
/* Figma 中的 CSS */
.product-card {
  width: 343px;
  height: 120px;
  background: #FFFFFF;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.product-title {
  font-size: 16px;
  color: #333333;
  font-weight: 500;
}

.product-price {
  font-size: 14px;
  color: #FF5722;
}
```

```wxss
/* 转换后的 WXSS */
.product-card {
  width: 686rpx;      /* 343 × 2 */
  height: 240rpx;     /* 120 × 2 */
  background: #FFFFFF;
  border-radius: 24rpx;  /* 12 × 2 */
  padding: 32rpx;     /* 16 × 2 */
  /* box-shadow 不支持，可改用：*/
  /* 1. 添加边框 */
  border: 1rpx solid #E0E0E0;
  /* 2. 或使用阴影图片作为背景 */
}

.product-title {
  font-size: 32rpx;   /* 16 × 2 */
  color: #333333;
  font-weight: 500;
}

.product-price {
  font-size: 28rpx;   /* 14 × 2 */
  color: #FF5722;
}
```

### 4. 编写 WXML 和 WXSS 代码

**从 Figma 布局到 Flexbox：**

Figma 使用 Auto Layout 的布局，转换为微信小程序的 Flexbox：

```xml
<!-- Figma Auto Layout (水平) -->
<!-- ↓ 转换为 ↓ -->
<view class="horizontal-layout">
  <view class="item">内容 1</view>
  <view class="item">内容 2</view>
</view>
```

```wxss
.horizontal-layout {
  display: flex;
  flex-direction: row;  /* 水平排列 */
  justify-content: space-between;  /* 两端对齐 */
  align-items: center;  /* 垂直居中 */
  gap: 20rpx;  /* 间距（需要计算具体值）*/
}
```

---

## 🤖 方式二：使用自动化工具

### 1. Figma 插件推荐

#### A. **Figma to Code**（免费）
- **安装**：Figma Community 搜索 "Figma to Code"
- **支持**：HTML/CSS, React, Vue
- **用法**：
  1. 选中设计元素
  2. 右键 → Plugins → Figma to Code
  3. 复制生成的代码
  4. 手动转换为 WXML/WXSS

#### B. **Builder.io**（免费 + 付费）
- **安装**：Figma Community 搜索 "Builder.io"
- **支持**：多种框架
- **特点**：支持 AI 辅助转换

#### C. **Anima**（免费 + 付费）
- **安装**：Figma Community 搜索 "Anima"
- **支持**：React, Vue, HTML
- **特点**：高保真还原

### 2. 使用脚本自动导出（高级）

如果你熟悉编程，可以使用 Figma API：

```javascript
// 示例：使用 Figma API 导出设计令牌
const FIGMA_TOKEN = '你的 Figma Personal Access Token';
const FILE_KEY = '你的 Figma 文件 Key';

// 获取文件中的颜色样式
fetch(`https://api.figma.com/v1/files/${FILE_KEY}`, {
  headers: { 'X-Figma-Token': FIGMA_TOKEN }
})
.then(res => res.json())
.then(data => {
  // 提取颜色并生成 WXSS 变量
  const colors = data.meta.styles;
  // 输出到 app.wxss
});
```

---

## 📐 单位转换速查表

| 设计稿尺寸 (px) | 小程序尺寸 (rpx) | 常见用途 |
|---------------|----------------|---------|
| 375px | 750rpx | iPhone 6/7/8 屏幕宽度 |
| 414px | 828rpx | iPhone 6/7/8 Plus 屏幕宽度 |
| 1px | 2rpx | 1 像素边框 |
| 14px | 28rpx | 小字字号 |
| 16px | 32rpx | 正文字号 |
| 18px | 36rpx | 标题字号 |
| 20px | 40rpx | 大标题字号 |
| 10px | 20rpx | 最小可点击区域 |
| 44px | 88rpx | 推荐最小触摸区域 |

**快速计算公式：**
```
小程序 rpx = 设计稿 px × 2
```

---

## 🎯 实战演练：从 Figma 到小程序首页

### 步骤 1：分析 Figma 设计稿

假设你的 Figma 首页包含：
- 顶部导航栏（高度 44px）
- Banner 轮播图（高度 200px）
- 分类图标网格（4 列）
- 商品列表（卡片式）

### 步骤 2：创建页面结构

```xml
<!-- pages/index/index.wxml -->
<view class="container">
  <!-- 导航栏 -->
  <view class="navbar">
    <text class="title"> Coco 点单</text>
  </view>

  <!-- Banner -->
  <swiper class="banner" indicator-dots autoplay>
    <swiper-item wx:for="{{banners}}" wx:key="id">
      <image src="{{item.image}}" mode="aspectFill"></image>
    </swiper-item>
  </swiper>

  <!-- 分类 -->
  <view class="category">
    <view class="category-item" wx:for="{{categories}}" wx:key="id">
      <image src="{{item.icon}}"></image>
      <text>{{item.name}}</text>
    </view>
  </view>

  <!-- 商品列表 -->
  <view class="product-list">
    <view class="product-card" wx:for="{{products}}" wx:key="id">
      <image src="{{item.image}}" class="product-image"></image>
      <view class="product-info">
        <text class="product-name">{{item.name}}</text>
        <text class="product-price">¥{{item.price}}</text>
      </view>
    </view>
  </view>
</view>
```

### 步骤 3：编写样式

```wxss
/* pages/index/index.wxss */
.container {
  padding-bottom: 120rpx; /* 留出底部安全距离 */
}

/* 导航栏 */
.navbar {
  height: 88rpx;  /* 44px × 2 */
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFFFFF;
  position: sticky;
  top: 0;
  z-index: 100;
}

.title {
  font-size: 36rpx;  /* 18px × 2 */
  font-weight: bold;
  color: #333333;
}

/* Banner */
.banner {
  height: 400rpx;  /* 200px × 2 */
  margin-bottom: 20rpx;
}

.banner image {
  width: 100%;
  height: 100%;
}

/* 分类 */
.category {
  display: flex;
  flex-wrap: wrap;
  padding: 20rpx;
  background: #FFFFFF;
}

.category-item {
  width: 25%;  /* 4 列 */
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 30rpx;
}

.category-item image {
  width: 80rpx;
  height: 80rpx;
  margin-bottom: 10rpx;
}

.category-item text {
  font-size: 24rpx;
  color: #666666;
}

/* 商品列表 */
.product-list {
  display: flex;
  flex-direction: column;
  padding: 20rpx;
}

.product-card {
  display: flex;
  background: #FFFFFF;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;
  border: 1rpx solid #E0E0E0;
}

.product-image {
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
  margin-right: 20rpx;
}

.product-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.product-name {
  font-size: 32rpx;
  color: #333333;
  font-weight: 500;
}

.product-price {
  font-size: 32rpx;
  color: #FF5722;
  font-weight: bold;
}
```

---

## 💡 最佳实践建议

### 1. **设计稿规范**
- ✅ 使用 375px 或 750px 宽度的设计稿（方便 1:2 转换）
- ✅ 定义统一的颜色样式和文本样式
- ✅ 使用 Component 管理可复用元素
- ✅ 使用 Auto Layout 实现响应式布局

### 2. **性能优化**
- ⚡ 图片压缩后再导入（使用 TinyPNG 等工具）
- ⚡ 使用 WebP 格式（体积更小）
- ⚡ 避免使用过大的背景图
- ⚡ 列表页使用虚拟列表（`<scroll-view>`）

### 3. **适配技巧**
- 📱 使用 rpx 单位自动适配不同屏幕
- 📱 测试不同机型的显示效果
- 📱 注意底部安全区域（iPhone X 及以上）

---

## 🔗 有用的工具链接

- **Figma 官方文档**: https://help.figma.com/
- **微信小程序设计指南**: https://developers.weixin.qq.com/miniprogram/design/
- **单位转换工具**: https://www.unitconverter.cc/
- **图片压缩**: https://tinypng.com/
- **颜色拾取**: https://uigradients.com/

---

## ❓ 常见问题

**Q: Figma 能直接生成微信小程序代码吗？**
A: 目前不能直接生成完美的 WXML/WXSS 代码，但可以生成 HTML/CSS 作为参考，然后手动转换。

**Q: 如何快速批量导出 Figma 中的所有图片？**
A: 使用 Figma 插件 "Export More" 或 "Batch Export" 可以批量导出多个元素。

**Q: 设计稿中的渐变色怎么转换？**
A: Figma 的 Dev Mode 会提供 CSS `linear-gradient()` 代码，但小程序不支持，需要用图片模拟或使用 Canvas。

**Q: 阴影效果如何实现？**
A: 小程序不支持 `box-shadow`，可以用以下方式模拟：
1. 使用半透明边框
2. 使用阴影图片作为背景
3. 使用多层 view 叠加制造阴影错觉

---

## 📝 总结

**推荐工作流：**
1. 在 Figma 完成设计并整理好图层
2. 使用 Dev Mode 查看样式和尺寸
3. 导出图片资源到项目 `images/` 目录
4. 手动编写 WXML 和 WXSS 代码（参考本文的转换规则）
5. 在微信开发者工具中实时预览调试

虽然需要手动转换，但这样能保证代码质量和性能最优！
