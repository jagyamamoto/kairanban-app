// セットアップ ウィザードが作るファイルが、実物の形からずれていないかの検査。
//
// ⚠ なぜこれがあるか
//   ウィザード(docs/assets/setup-wizard.js)は org.ts と wrangler.jsonc を
//   「文字列のひな形」として持っている。実物に項目を足したり名前を変えたりすると、
//   ウィザードは古い形のファイルを平然と吐き続け、初心者はそれを信じて貼る。
//   目視では絶対に気づけないので、ここで落とす。
//
// 使い方: node tools/check-wizard-sync.mjs   (npm run check から呼ばれる)

import { readFileSync } from "node:fs";

const org = readFileSync("src/shared/org.ts", "utf8");
const wr  = readFileSync("wrangler.jsonc", "utf8");
const js  = readFileSync("docs/assets/setup-wizard.js", "utf8");
const errors = [];

// (1) 区分のキー: 実物 roleLabels のキー = ウィザード ROLE_KEYS のキー(順序も)
const roleBlock = org.slice(org.indexOf("roleLabels: {"), org.indexOf("},", org.indexOf("roleLabels: {")));
const realRoles = [...roleBlock.matchAll(/^\s+([a-z_]+):\s*"/gm)].map((m) => m[1]);
// ⚠ ROLE_KEYS の中だけを見る。ファイル全体を見ると ["os", "hasNode", …] のような
//   別の配列まで拾って、正しい状態を「ずれている」と誤判定する(最初にやった)。
const rkStart = js.indexOf("var ROLE_KEYS = [");
const rkBlock = js.slice(rkStart, js.indexOf("];", rkStart));
const wizRoles  = [...rkBlock.matchAll(/\["([a-z_]+)",\s*"/g)].map((m) => m[1]);
if (realRoles.join() !== wizRoles.join()) {
  errors.push(`会員区分のキーが違います\n      実物:       ${realRoles.join(", ")}\n      ウィザード: ${wizRoles.join(", ")}`);
}

// (2) ORG の最上位の項目名が全部ウィザードの出力に含まれているか
const orgTop = [...org.matchAll(/^  ([a-zA-Z]+):/gm)].map((m) => m[1]);
for (const k of orgTop) {
  if (!new RegExp(`"  ${k}: `).test(js) && !new RegExp(`'  ${k}: `).test(js) && !js.includes(`"  ${k}:`)) {
    errors.push(`org.ts の項目「${k}」がウィザードの出力に無い`);
  }
}

// (3) wrangler.jsonc の vars とバインディング名が全部ウィザードの出力に含まれているか
const wrVars = [...wr.matchAll(/^\s+"([A-Z_]+)":\s*"/gm)].map((m) => m[1]);
for (const v of wrVars) if (!js.includes(`"${v}"`)) errors.push(`wrangler.jsonc の "${v}" がウィザードの出力に無い`);
for (const b of ["DB", "AI", "IMAGES", "ASSETS", "run_worker_first", "migrations_dir", "compatibility_date", "crons"]) {
  if (!wr.includes(b)) errors.push(`実物の wrangler.jsonc に ${b} が無い(検査の前提が変わった)`);
  if (!js.includes(b)) errors.push(`wrangler.jsonc の ${b} がウィザードの出力に無い`);
}
const cd = wr.match(/"compatibility_date":\s*"([^"]+)"/)?.[1];
if (cd && !js.includes(`"compatibility_date": "${cd}"`)) errors.push(`compatibility_date が違います(実物 ${cd})`);

if (errors.length) {
  console.error("セットアップ ウィザードの出力が、実物のファイルとずれています。\n");
  for (const e of errors) console.error("  ✗ " + e);
  console.error("\n直す場所: docs/assets/setup-wizard.js の ROLE_KEYS / genOrg / genWrangler");
  console.error("⚠ 初心者はウィザードの出力をそのまま貼ります。ずれたままだと動かないアプリができます。");
  process.exit(1);
}
console.log(`ウィザードの検査: OK（区分${realRoles.length}種・ORG ${orgTop.length}項目・vars ${wrVars.length}個が一致）`);
