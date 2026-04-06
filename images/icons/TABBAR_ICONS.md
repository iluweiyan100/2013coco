# TabBar 图标说明

## 需要的图标文件

根据 app.json 配置，需要以下 PNG 格式的 TabBar 图标（每个图标需要两个版本：正常和选中）：

### 1. 首页 (Home)
- `images/icons/home.png` - 未选中状态（棕色 #5A3A29）
- `images/icons/home-active.png` - 选中状态（红色 #A3212D）

### 2. 点单 (Order)
- `images/icons/order.png` - 未选中状态（棕色 #5A3A29）
- `images/icons/order-active.png` - 选中状态（红色 #A3212D）

### 3. 订单 (Orders)
- `images/icons/orders.png` - 未选中状态（棕色 #5A3A29）
- `images/icons/orders-active.png` - 选中状态（红色 #A3212D）

### 4. 我的 (Profile)
- `images/icons/profile.png` - 未选中状态（棕色 #5A3A29）
- `images/icons/profile-active.png` - 选中状态（红色 #A3212D）

## 图标规格

- **尺寸**: 81px × 81px（推荐）或 162px × 162px（@2x）
- **格式**: PNG（支持透明背景）
- **颜色**: 
  - 未选中: #5A3A29（深棕色）
  - 选中: #A3212D（深红色）

## 如何生成图标

### 方法 1: 从 Figma 导出
1. 在 Figma 中找到对应的图标组件
2. 选择图标，点击右侧面板的 "Export"
3. 选择 PNG 格式，设置尺寸为 81px 或 162px
4. 分别导出两种颜色版本

### 方法 2: 使用在线工具转换 SVG
1. 将现有的 SVG 图标转换为 PNG
2. 使用工具如 https://cloudconvert.com/svg-to-png
3. 设置尺寸为 81×81 或 162×162
4. 手动调整颜色

### 方法 3: 使用设计软件
1. 在 Sketch/Figma/Photoshop 中打开 SVG
2. 调整颜色为指定色值
3. 导出为 PNG 格式

## 临时解决方案

如果暂时没有图标，可以：
1. 使用纯色方块作为占位符
2. 使用微信开发者工具的默认图标
3. 暂时注释掉 tabBar 配置，使用自定义导航

## 注意事项

⚠️ **重要**: 
- TabBar 不支持 SVG 格式，必须使用 PNG
- 图标必须有透明背景
- 确保图标在不同分辨率下清晰可见
- 建议提供 @2x 和 @3x 版本以适配不同设备
