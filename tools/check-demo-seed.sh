#!/bin/bash
# デモ用の架空データ(src/server/demoseed.ts)が、実際のデータベース定義と合っているか確かめる。
# 列名を変えるマイグレーションを足したときは、これを実行してください。
set -eu
cd "$(dirname "$0")/.."
CFG="${1:-wrangler.demo.jsonc}"
DB=$(python3 -c "import re,io;print(re.search(r'\"database_name\": \"([^\"]+)\"', io.open('$CFG',encoding='utf-8').read()).group(1))")
python3 - <<'PY' > /tmp/demo-seed.sql
import io,re
t=io.open('src/server/demoseed.ts',encoding='utf-8').read()
print('\n\n'.join(m.group(1).strip()+';' for m in re.finditer(r'`(INSERT INTO .*?)`', t, re.S)))
PY
for t in sponsors documents meetings reservations circulars role_assignments persons; do
  npx wrangler d1 execute "$DB" --local -c "$CFG" --command "DELETE FROM $t" >/dev/null 2>&1 || true
done
npx wrangler d1 execute "$DB" --local -c "$CFG" --file /tmp/demo-seed.sql 2>&1 | grep -E "ERROR|executed successfully"
