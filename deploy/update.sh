#!/usr/bin/env bash
# Dispatch 一鍵更新：拉新程式 → 重建前端 → 補套件 → 重啟服務
# 用法（VM 上）：bash ~/Dispatch/deploy/update.sh
set -e
cd "$(dirname "$0")/.."

echo "▸ 拉取最新程式..."
git pull origin claude/clever-cray-o05a2o

echo "▸ 建置前端..."
cd frontend && npm install --no-audit --no-fund && npm run build

echo "▸ 更新後端套件..."
cd ../backend && .venv/bin/pip install -q -r requirements.txt

echo "▸ 重啟服務..."
sudo systemctl restart dispatch
sleep 2
systemctl is-active dispatch >/dev/null && echo "✅ 更新完成，服務運行中" || {
  echo "❌ 服務未啟動，查看日誌：journalctl -u dispatch -n 50"
  exit 1
}
