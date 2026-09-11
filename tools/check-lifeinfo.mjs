// 架空のごみの日が会員に出てしまうのを、公開前に止める検査。
//
// ⚠ なぜこれがあるか
//   src/shared/lifeinfo.ts の中身は**すべて架空のサンプル**(みどり区・みどり町)。
//   LIFE_INFO_ENABLED を true にしただけで中身を書き換えないと、
//   よその町の嘘の収集日が「生活情報」タブに出る。
//   ごみが出せない・収集されないという実害になるうえ、
//   画面を見ただけでは「それらしく」見えるので目視では気づけない。
//
// 使い方: node tools/check-lifeinfo.mjs   (npm run check から呼ばれる)

import { readFileSync } from "node:fs";

const FILE = "src/shared/lifeinfo.ts";
const src = readFileSync(FILE, "utf8");

const enabled = /export const LIFE_INFO_ENABLED\s*=\s*true/.test(src);
if (!enabled) {
  console.log("生活情報の検査: OK(生活情報タブは切ってあります)");
  process.exit(0);
}

// 有効にしているなら、サンプルの痕跡が残っていてはいけない
const SAMPLES = [
  ["みどり区", "サンプルの区名"],
  ["みどり町", "サンプルの町名"],
  ["https://www.example.com", "差し替えていないリンク"],
  ["03-6431-9997", "サンプルの粗大ごみ受付番号"],
];

const found = SAMPLES.filter(([needle]) => src.includes(needle));

if (found.length) {
  console.error("生活情報タブを出す設定(LIFE_INFO_ENABLED = true)になっていますが、");
  console.error("中身がサンプルのままの箇所があります。\n");
  for (const [needle, why] of found) {
    const n = src.split(needle).length - 1;
    console.error(`  ✗ ${needle}  (${why}) — ${n}か所`);
  }
  console.error(`\n直す場所: ${FILE}`);
  console.error("⚠ 架空の収集日を会員に出すと、ごみが出せない・収集されない実害が出ます。");
  console.error("  書き換える予定がないなら LIFE_INFO_ENABLED = false に戻してください。");
  console.error("  (ごみの日は管理画面の「ページ」でも載せられます。そちらはこの検査と無関係です)");
  process.exit(1);
}

console.log("生活情報の検査: OK(サンプルの痕跡はありません)");
