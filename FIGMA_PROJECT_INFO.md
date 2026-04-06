# 🎨 Figma 设计稿信息

## 📋 项目信息

- **Figma 文件链接**: https://www.figma.com/design/AXqtqv0MFDWjgG4btMJtn9/2013coco?node-id=1-2&m=dev
- **文件 Key**: `AXqtqv0MFDWjgG4btMJtn9`
- **起始节点**: `1-2`

## ⚙️ VSCode 配置状态

✅ **已配置**:
- Figma 文件 Key: `AXqtqv0MFDWjgG4btMJtn9`
- 小程序文件关联（.wxml, .wxss）
- Emmet 支持 WXML

⏳ **待配置**:
- Figma Personal Access Token（需要你手动填入）

## 🔑 获取并配置 Token

### 步骤 1：获取 Token

1. 打开 https://www.figma.com/developers/api#access-tokens
2. 登录 Figma
3. 点击右上角头像 → **Settings**
4. 左侧菜单选择 **Personal access tokens**
5. 点击 **Create new token**
6. 输入名称（如 "VSCode Integration"）
7. **复制生成的 Token**（只显示一次！）

### 步骤 2：配置 Token

打开 `.vscode/settings.json` 文件，找到这一行：

```json
"figma.token": "", // TODO: 在这里填入你的 Figma Personal Access Token
```

将空字符串替换为你的 Token：

```json
"figma.token": "figd_xxxxxxxxxxxxxxxxxxxx", // 你的 Token
```

保存文件后，**重启 VSCode** 使配置生效。

## 🚀 开始转换设计稿

### 方法 1：从链接转换（推荐）

1. **在 Figma 中**：
   - 打开你的设计稿
   - 选中要转换的 Frame 或组件
   - 右键 → **Copy link to selection**

2. **在 VSCode 中**：
   - 创建或打开目标文件（如 `pages/index/index.wxml`）
   - 按 `Cmd+Shift+P` (Mac) 或 `Ctrl+Shift+P` (Windows)
   - 输入 **"Figma to Code"**
   - 选择 **"Convert from Figma Link"**
   - 粘贴刚才复制的链接
   - 代码会自动插入到当前文件中

### 方法 2：直接转换整个页面

1. 在 VSCode 中打开命令面板 (`Cmd+Shift+P`)
2. 输入 **"Figma to Code"**
3. 选择 **"Convert File"**
4. 插件会使用配置的 `defaultFileKey` 自动读取文件

### 方法 3：从选中的元素转换

1. 在 Figma 中选中元素
2. 在 VSCode 中选择 **"Convert Selection"**
3. 插件会读取当前选中的设计元素

## 📝 代码后处理清单

插件生成的代码需要调整为微信小程序格式：

### ✅ 必须做的调整

1. **标签替换**：
   ```
   <div>     → <view>
   </div>    → </view>
   <img>     → <image>
   <span>    → <text>
   <p>       → <text>
   <button>  → <button> (保持不变)
   ```

2. **单位转换**：
   ```css
   width: 375px;      → width: 750rpx;
   height: 100px;     → height: 200rpx;
   font-size: 16px;   → font-size: 32rpx;
   padding: 20px;     → padding: 40rpx;
   margin: 10px;      → margin: 20rpx;
   ```

3. **图片路径**：
   ```html
   <!-- 生成 -->
   <img src="https://..." />
   
   <!-- 改为 -->
   <image src="/images/xxx.png" mode="aspectFill" />
   ```

4. **事件绑定**：
   ```html
   <!-- 生成 -->
   <button onclick="handleClick">按钮</button>
   
   <!-- 改为 -->
   <button bindtap="handleClick">按钮</button>
   ```

### ⚠️ 不支持的特性

以下 CSS 特性在小程序中不支持，需要替代方案：

| 不支持 | 替代方案 |
|--------|---------|
| `box-shadow` | 使用边框或阴影图片 |
| CSS Grid | 改用 Flexbox |
| `position: sticky` | 部分支持，需测试 |
| 复杂动画 | 使用小程序动画 API |
| `::before` / `::after` | 添加额外 view 元素 |

## 🎯 实战示例

假设你要转换首页（节点 1-2）：

### 第 1 步：在 Figma 中

1. 打开链接：https://www.figma.com/design/AXqtqv0MFDWjgG4btMJtn9/2013coco?node-id=1-2&m=dev
2. 选中首页的根 Frame
3. 右键 → Copy link to selection

### 第 2 步：在 VSCode 中

```bash
# 确保在正确的文件中
code pages/index/index.wxml
```

然后使用插件转换。

### 第 3 步：调整代码

根据上面的清单进行标签和单位转换。

## 📚 相关文档

- [FIGMA_SETUP.md](./FIGMA_SETUP.md) - 详细配置指南
- [FIGMA_GUIDE.md](./FIGMA_GUIDE.md) - Figma 转小程序完整教程

## 💡 小贴士

1. **批量转换**：可以逐个 Frame 转换，保持代码结构清晰
2. **组件复用**：Figma 中的 Component 可以转换为小程序的自定义组件
3. **样式提取**：将重复使用的样式提取到 `app.wxss` 或单独的 wxss 文件
4. **图片优化**：导出前先用 TinyPNG 压缩图片

## ❓ 遇到问题？

如果转换过程中遇到问题：

1. 检查 Token 是否正确配置
2. 确认 Figma 文件是否有访问权限
3. 查看 VSCode 输出面板的错误信息
4. 尝试重新加载 VSCode 窗口

---

**下一步行动**：
1. ✅ 获取并配置 Figma Token
2. ✅ 重启 VSCode
3. ✅ 尝试转换第一个页面
4. ✅ 告诉我转换结果，我可以帮你优化代码！

祝你开发顺利！🚀
