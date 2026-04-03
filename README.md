# 微信点单小程序

## 项目简介

这是一个基于微信小程序云开发的点单小程序，使用腾讯云开发服务。

## 技术栈

- **前端**: 微信小程序原生开发 (WXML, WXSS, JavaScript)
- **后端**: 微信云函数 (Node.js)
- **数据库**: 云开发文档型数据库
- **存储**: 云开发云存储
- **环境**: 腾讯云开发环境 `cloud1-8grqm06168739c22`

## 项目结构

```
.
├── cloudfunctions/          # 云函数目录
│   └── getOpenId/          # 获取用户 OpenID 云函数
├── components/              # 组件目录
│   └── navigation-bar/     # 自定义导航栏组件
├── pages/                   # 页面目录
│   └── index/              # 首页
├── app.js                   # 小程序入口文件
├── app.json                 # 小程序全局配置
├── app.wxss                 # 小程序全局样式
├── project.config.json      # 项目配置文件
├── cloudbaserc.json         # 云开发配置文件
└── sitemap.json             # 索引配置
```

## 云开发资源配置

### 环境信息
- **环境 ID**: `cloud1-8grqm06168739c22`
- **环境别名**: cloud1
- **区域**: ap-shanghai (上海)
- **状态**: NORMAL (正常运行)

### 已开通服务
✅ **文档型数据库**: 实例 ID `tnt-5r2vkk4zi`，状态 RUNNING
✅ **云存储**: Bucket `636c-cloud1-8grqm06168739c22-1419079738`，CDN 域名已配置
✅ **云函数**: 命名空间 `cloud1-8grqm06168739c22`，区域 ap-shanghai
✅ **静态网站托管**: 域名 `cloud1-8grqm06168739c22-1419079738.tcloudbaseapp.com`

### 控制台访问地址
- **云开发控制台**: https://tcb.cloud.tencent.com/dev?envId=cloud1-8grqm06168739c22
- **数据库管理**: https://tcb.cloud.tencent.com/dev?envId=cloud1-8grqm06168739c22#/db/doc
- **云函数管理**: https://tcb.cloud.tencent.com/dev?envId=cloud1-8grqm06168739c22#/scf
- **云存储管理**: https://tcb.cloud.tencent.com/dev?envId=cloud1-8grqm06168739c22#/storage

## 开发指南

### 环境准备

1. 安装微信开发者工具
2. 在 `project.config.json` 中填入你的 AppID
3. 已在 `app.js` 中配置云开发环境 ID

### 云函数部署

```bash
# 在微信开发者工具中
# 右键点击 cloudfunctions/getOpenId 目录
# 选择 "上传并部署：云端安装依赖"
```

### 本地调试

1. 打开微信开发者工具
2. 导入本项目
3. 在详情中确认云开发环境配置
4. 编译运行即可

## 核心功能

### 1. 云开发初始化
- 已在 `app.js` 中完成云开发环境初始化
- 环境 ID: `cloud1-8grqm06168739c22`

### 2. 用户身份获取
- 通过云函数 `getOpenId` 获取用户唯一标识
- 无需手动登录，天然基于微信授权

### 3. 数据库操作
- 使用云开发文档型数据库
- 支持增删改查、实时推送等能力

### 4. 云存储
- 图片、文件上传下载
- CDN 加速访问

## 注意事项

1. **AppID 配置**: 请在 `project.config.json` 中填入有效的小程序 AppID
2. **云开发版本**: 需要使用基础库 2.2.3 或以上版本
3. **CDN 缓存**: 静态资源部署后可能有几分钟 CDN 缓存延迟
4. **开发配额**: 当前使用个人版套餐，请注意配额限制

## 后续开发建议

1. **数据库设计**: 创建菜品、订单、用户等集合
2. **云函数扩展**: 实现点单、支付、订单管理等业务逻辑
3. **页面开发**: 完善菜单浏览、购物车、订单页面
4. **云存储集成**: 菜品图片、用户头像等资源管理

## 许可证

MIT License
