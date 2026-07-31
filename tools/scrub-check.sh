#!/bin/bash
# 公開してよい状態かを機械的に確認する。
# 亀戸版から公開版(kairanban)を作るときに使った検査を、いつでも再実行できるようにしたもの。
# 使い方: bash tools/scrub-check.sh
set -u
cd "$(dirname "$0")/.."
NG='亀戸|kameido|Kameido|KAMEIDO|香取|松柏|shochiku|jagyamamoto|jagproject|京葉道路|江東|墨田|江戸川|ktaiwork|sugumail|水神小学校|中央学院'
echo "=== 1. 地域固有の語が残っていないか ==="
# github.com/jagyamamoto/kairanban-app はこのプロジェクト自身のURLなので除外する
hit=$(grep -rniE "$NG" --include="*.ts" --include="*.tsx" --include="*.html" --include="*.jsonc" \
  --include="*.js" --include="*.webmanifest" --include="*.sql" --include="*.mjs" --include="*.json" --include="*.md" \
  src public migrations tools index.html wrangler.jsonc package.json 2>/dev/null \
  | grep -v node_modules | grep -v 'jagyamamoto/kairanban-app')
if [ -n "$hit" ]; then echo "$hit"; echo "  ⚠ 残っています"; else echo "  なし ✅"; fi

echo "=== 2. 実在しそうな電話番号 ==="
tel=$(grep -rnoE '0[789]0[0-9]{8}' --include="*.ts" --include="*.tsx" --include="*.html" src public 2>/dev/null \
  | grep -vE '09012345678|090000000[0-9][0-9]')  # 09012345678=入力例, 0900000000x=デモの架空データ
if [ -n "$tel" ]; then echo "$tel"; echo "  ⚠ 確認してください"; else echo "  例示用のみ ✅"; fi

echo "=== 3. 鍵・IDの実値 ==="
key=$(grep -rnoE 're_[A-Za-z0-9_]{16,}|B[A-Za-z0-9_-]{80,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' \
  --include="*.ts" --include="*.jsonc" --include="*.json" src wrangler.jsonc 2>/dev/null | grep -v '00000000-0000')
if [ -n "$key" ]; then echo "$key"; echo "  ⚠ 実値かどうか確認"; else echo "  なし ✅"; fi

echo "=== 4. 公開画像に写り込んだ文字 ==="
if command -v python3 >/dev/null && python3 -c "import Vision" 2>/dev/null; then
  python3 tools/ocr-check-images.py 'public/help/img/*' 2>/dev/null | python3 -c "
import sys,json,re
d=json.load(sys.stdin); bad=False
for f,t in d.items():
    ng=[w for w in ['亀戸','北部町会','香取','jag','kameido'] if w.lower() in t.lower()]
    if ng: print(' ',f,'⚠',ng); bad=True
print('  問題なし ✅' if not bad else '  ⚠ 要対応')"
else
  echo "  (macOS以外ではスキップ。目視で確認してください)"
fi

echo "=== 5. 型検査とビルド ==="
npm run check >/dev/null 2>&1 && echo "  型検査 ✅" || { echo "  ⚠ 型検査で失敗"; npm run check 2>&1 | tail -5; }
npm run build >/dev/null 2>&1 && echo "  ビルド ✅" || { echo "  ⚠ ビルドで失敗"; npm run build 2>&1 | tail -5; }
