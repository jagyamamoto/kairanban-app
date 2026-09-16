#!/bin/bash
# Mac用: ダブルクリックでターミナルが開き、セットアップが始まります。
# ⚠ 初回は「開発元を確認できないため開けません」と出ることがあります。
#   その場合: このファイルを右クリック →「開く」。それでも出たら
#   システム設定 → プライバシーとセキュリティ → 下の方の「このまま開く」。
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js が入っていません。"
  echo "https://nodejs.org/ja を開いて「推奨版」を入れてから、もう一度ダブルクリックしてください。"
  echo ""
  read -r -p "Enter を押すと閉じます"
  exit 1
fi
node tools/setup.mjs "$@"
echo ""
read -r -p "Enter を押すと閉じます"
