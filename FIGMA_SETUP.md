# Figma-to-Code Sync 配置指南

## 🔑 第一步：获取 Figma Personal Access Token

1. 登录 Figma
2. 点击右上角头像 → **Settings**
3. 左侧菜单选择 **Personal access tokens**
4. 点击 **Create new token**
5. 输入名称（如 "VSCode Integration"）
6. 复制生成的 Token（只显示一次，请妥善保存）

## ⚙️ 第二步：配置 VSCode

### 方法 A：通过 VSCode 设置界面

1. 打开 VSCode 设置：`Cmd+,` (Mac) 或 `Ctrl+,` (Windows)
2. 搜索 "figma"
3. 找到 **Figma: Token** 设置项
4. 粘贴你的 Personal Access Token

### 方法 B：直接编辑 settings.json

在 `.vscode/settings.json` 中添加：

```json
{
  "figma.token": "你的_Figma_Personal_Access_Token",
  "figma.defaultFileKey": "你的_Figma_文件_Key"
}
```

## 📋 第三步：获取 Figma 文件 Key

1. 打开你的 Figma 设计稿
2. 查看浏览器地址栏 URL：
   ```
   https://www.figma.com/file/FILE_KEY/文件名
   ```
3. 复制 `FILE_KEY` 部分

例如：
```
https://www.figma.com/file/abc123def456/Coco点单设计
                              ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
                              这就是 FILE_KEY
```

## 🎯 第四步：开始转换

### 方式 1：从 Figma 链接转换

1. 在 Figma 中选中要转换的 Frame 或组件
2. 右键 → **Copy link to selection**
3. 回到 VSCode
4. 按 `Cmd+Shift+P` (Mac) 或 `Ctrl+Shift+P` (Windows)
5. 输入 "Figma to Code"
6. 选择 **Convert from Figma Link**
7. 粘贴刚才复制的链接

### 方式 2：从当前选中的元素转换

1. 在 Figma 中选中元素
2. 在 VSCode 中打开命令面板
3. 选择 **Figma to Code: Convert Selection**
4. 插件会自动读取选中的设计元素

### 方式 3：批量转换整个页面

1. 在 VSCode 中创建新的 WXML 文件
2. 按 `Cmd+Shift+P`
3. 选择 **Figma to Code: Convert File**
4. 输入 Figma 文件 Key

## 📝 第五步：调整生成的代码

插件生成的代码通常是 HTML/CSS，需要手动调整为微信小程序格式：

### 自动调整建议

创建 `.vscode/settings.json` 添加以下配置：

```json
{
  "emmet.includeLanguages": {
    "wxml": "html"
  },
  "files.associations": {
    "*.wxss": "css",
    "*.wxml": "html"
  }
}
```

## 🔄 转换对照表

| Figma 元素 | 生成代码 | 小程序对应 |
|-----------|---------|----------|
| Frame | `<div>` | `<view>` |
| Text | `<span>` / `<p>` | `<text>` |
| Image | `<img>` | `<image>` |
| Button | `<button>` | `<button>` |
| Auto Layout (水平) | `flex-direction: row` | 保持不变 |
| Auto Layout (垂直) | `flex-direction: column` | 保持不变 |

## 💡 实用技巧

### 1. 快速单位转换

在 VSCode 中安装 **px to rem** 插件后：
- 选中 CSS 中的 px 值
- 按快捷键转换为 rpx
- 或使用正则替换：查找 `(\d+)px`，替换为 `$1 * 2rpx`

### 2. 批量替换标签

使用 VSCode 的查找替换功能（`Cmd+F` → 切换到替换模式）：

```
查找: <div
替换: <view

查找: </div>
替换: </view>

查找: <img
替换: <image

查找: <span
替换: <text

查找: </span>
替换: </text>
```

### 3. 样式优化

生成的 CSS 需要调整为 WXSS：

```css
/* 生成的 CSS */
.container {
  width: 375px;
  display: flex;
}

/* 调整为 WXSS */
.container {
  width: 750rpx;  /* px × 2 */
  display: flex;
}
```

## ⚠️ 注意事项

1. **图片路径**：生成的 `<img src="...">` 需要改为小程序的相对路径
2. **事件绑定**：`onclick` 需要改为 `bindtap`
3. **条件渲染**：`v-if` / `*ngIf` 需要改为 `wx:if`
4. **列表渲染**：`v-for` / `*ngFor` 需要改为 `wx:for`
5. **不支持的特性**：
   - CSS Grid（改用 Flexbox）
   - `position: sticky`（部分支持）
   - `box-shadow`（改用边框或图片）
   - 复杂的 CSS 动画

## 🎨 实战示例

假设你在 Figma 中设计了一个商品卡片：

### Figma 结构
```
Frame: Product Card (Auto Layout, 垂直)
├─ Image: product.jpg (343×200)
├─ Text: "拿铁咖啡" (16px, #333)
└─ Text: "¥28" (14px, #FF5722)
```

### 插件生成的 HTML
```html
<div class="product-card">
  <img src="product.jpg" alt="" />
  <span class="title">拿铁咖啡</span>
  <span class="price">¥28</span>
</div>
```

### 生成的 CSS
```css
.product-card {
  width: 343px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.title {
  font-size: 16px;
  color: #333333;
}

.price {
  font-size: 14px;
  color: #FF5722;
}
```

### 转换为小程序代码

**WXML:**
```xml
<view class="product-card">
  <image src="/images/product.jpg" mode="aspectFill"></image>
  <text class="title">拿铁咖啡</text>
  <text class="price">¥28</text>
</view>
```

**WXSS:**
```wxss
.product-card {
  width: 686rpx;      /* 343 × 2 */
  display: flex;
  flex-direction: column;
  gap: 16rpx;         /* 8 × 2 */
  padding: 24rpx;     /* 12 × 2 */
  background: #FFFFFF;
  border-radius: 16rpx;
}

.title {
  font-size: 32rpx;   /* 16 × 2 */
  color: #333333;
}

.price {
  font-size: 28rpx;   /* 14 × 2 */
  color: #FF5722;
  font-weight: bold;
}
```

## 🔧 故障排除

### 问题 1：提示 "Invalid token"
**解决：** 检查 Token 是否正确复制，确保没有多余空格

### 问题 2：无法连接到 Figma
**解决：** 
- 检查网络连接
- 确认 Figma 文件是公开的或你有访问权限
- 尝试刷新 Figma 页面重新获取链接

### 问题 3：生成的代码格式混乱
**解决：**
- 在 VSCode 中安装 **Prettier** 插件
- 右键 → Format Document 格式化代码
- 然后手动调整为小程序语法

## 📚 更多资源

- Figma-to-Code 官方文档：https://github.com/BuilderIO/figma-to-code
- 微信小程序开发文档：https://developers.weixin.qq.com/miniprogram/dev/
- Figma API 文档：https://www.figma.com/developers/api

---

**下一步：**
1. 获取你的 Figma Token
2. 配置到 VSCode
3. 告诉我你的 Figma 文件链接，我可以帮你转换第一个页面！
