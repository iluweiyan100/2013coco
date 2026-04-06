#!/bin/bash

# Figma Token 配置助手
# 使用方法: chmod +x setup-figma.sh && ./setup-figma.sh

echo "🎨 Figma-to-Code Sync 配置助手"
echo "================================"
echo ""

# 检查 settings.json 是否存在
SETTINGS_FILE=".vscode/settings.json"

if [ ! -f "$SETTINGS_FILE" ]; then
    echo "❌ 错误: 找不到 $SETTINGS_FILE 文件"
    exit 1
fi

echo "📋 请按以下步骤操作:"
echo ""
echo "1️⃣  获取 Figma Personal Access Token:"
echo "   - 打开 https://www.figma.com/developers/api#access-tokens"
echo "   - 登录 Figma"
echo "   - 点击右上角头像 → Settings"
echo "   - 左侧菜单选择 'Personal access tokens'"
echo "   - 点击 'Create new token'"
echo "   - 复制生成的 Token"
echo ""

read -p "2️⃣  请输入你的 Figma Token: " FIGMA_TOKEN

if [ -z "$FIGMA_TOKEN" ]; then
    echo "❌ Token 不能为空"
    exit 1
fi

echo ""
echo "3️⃣  获取 Figma 文件 Key:"
echo "   - 打开你的 Figma 设计稿"
echo "   - 查看浏览器地址栏 URL"
echo "   - 格式: https://www.figma.com/file/FILE_KEY/文件名"
echo "   - 复制 FILE_KEY 部分"
echo ""

read -p "4️⃣  请输入你的 Figma 文件 Key (可选，可稍后填写): " FILE_KEY

echo ""
echo "⚙️  正在配置..."

# 使用 sed 替换 token
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/\"figma.token\": \"\"/\"figma.token\": \"$FIGMA_TOKEN\"/" "$SETTINGS_FILE"
    if [ ! -z "$FILE_KEY" ]; then
        sed -i '' "s/\"figma.defaultFileKey\": \"\"/\"figma.defaultFileKey\": \"$FILE_KEY\"/" "$SETTINGS_FILE"
    fi
else
    # Linux
    sed -i "s/\"figma.token\": \"\"/\"figma.token\": \"$FIGMA_TOKEN\"/" "$SETTINGS_FILE"
    if [ ! -z "$FILE_KEY" ]; then
        sed -i "s/\"figma.defaultFileKey\": \"\"/\"figma.defaultFileKey\": \"$FILE_KEY\"/" "$SETTINGS_FILE"
    fi
fi

echo ""
echo "✅ 配置完成！"
echo ""
echo "📖 下一步操作:"
echo "   1. 重启 VSCode"
echo "   2. 在 Figma 中选中要转换的元素"
echo "   3. 右键 → Copy link to selection"
echo "   4. 在 VSCode 中按 Cmd+Shift+P"
echo "   5. 输入 'Figma to Code' 并选择相应命令"
echo ""
echo "💡 提示: 详细的配置指南请查看 FIGMA_SETUP.md 文件"
