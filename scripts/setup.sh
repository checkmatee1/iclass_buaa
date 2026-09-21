#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "开始初始化环境..."

# 检查 node 是否安装
if ! [ -x "$(command -v node)" ]; then
  echo '错误: 本机未安装 Node.js，请先安装。' >&2
  exit 1
fi

# 1. 安装依赖
echo "正在安装依赖，请稍候..."
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..

echo "依赖安装完成！"

# 2. 询问是否立即启动
read -r -p "是否立即启动应用? (y/n): " confirm
if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
    # 使用 npm run dev 启动 concurrently 管理的复合命令
    npm run dev
fi
