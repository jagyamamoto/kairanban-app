#!/usr/bin/env node
// ターミナル版セットアップ。質問に答えるか、ウィザードで保存した kairanban-setup.json を読んで、
// 設定ファイルを書き、Cloudflare のコマンドを順に実行し、公開まで進める。
//
// 方針(オーナー指示 2026-09-16: 初心者・Mac/Win・AI契約なし):
//   - 追加の道具は要らない。Node の標準機能だけで動く(npm install の前でも動く)
//   - 合言葉・秘密鍵・APIキーは**画面に出さず、ファイルにも書かず**、wrangler へ直接渡す
//   - 途中でやめても、もう一度実行すれば続きから(.setup-state.json)
//   - --dry-run … 何をするかを表示するだけ。ファイルもコマンドも触らない
//   - 生成するファイルの中身は docs/assets/wizard-core.js(ブラウザ版と同じ頭脳)から作る
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const DRY = process.argv.includes("--dry-run");
const WIN = process.platform === "win32";
const STATE = ".setup-state.json";
const argAnswers = (() => { const i = process.argv.indexOf("--answers"); return i > -1 ? process.argv[i + 1] : ""; })();

// ───────── 表示 ─────────
const c = { g: "\x1b[32m", y: "\x1b[33m", r: "\x1b[31m", b: "\x1b[1m", d: "\x1b[2m", n: "\x1b[0m" };
const say = (s = "") => console.log(s);
const head = (s) => say(`\n${c.b}${s}${c.n}`);
const ok = (s) => say(`  ${c.g}✓${c.n} ${s}`);
const warn = (s) => say(`  ${c.y}⚠${c.n} ${s}`);
const fail = (s) => { say(`\n  ${c.r}✗ ${s}${c.n}`); };
const die = (s) => { fail(s); say("\n  ここまでの分は残っています。直したら、もう一度この画面を開いてください(続きから始まります)。\n"); process.exit(1); };

// ───────── 質問 ─────────
// ⚠ 答えは 'line' で受けて**貯める**。rl.question だけに頼ると、パイプで一気に流し込まれた
//   2行目以降が(質問がまだ出ていない瞬間に届くため)捨てられ、次の質問が永遠に待つ。
//   人が打つとき(TTY)は今までどおり。AIやスクリプトが答えを流し込むときはこれで拾える。
const TTY = !!process.stdin.isTTY;
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: TTY });
let muted = false;
if (TTY) { const origWrite = rl._writeToOutput.bind(rl); rl._writeToOutput = (s) => { if (muted) { if (/\r?\n/.test(s)) origWrite("\n"); return; } origWrite(s); }; }
const lines = []; let waiter = null; let closed = false;
rl.on("line", (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else lines.push(l); });
rl.on("close", () => { closed = true; if (waiter) { const w = waiter; waiter = null; w(""); } });
const nextLine = () => lines.length ? Promise.resolve(lines.shift()) : (closed ? Promise.resolve("") : new Promise((res) => { waiter = res; }));
const ask = async (q, def = "") => { process.stdout.write(`  ${q}${def ? ` ${c.d}(そのままEnterで「${def}」)${c.n}` : ""}: `); const a = (await nextLine()).trim(); if (!TTY) process.stdout.write(a ? "…\n" : "\n"); return a || def; };
const askSecret = async (q) => { muted = true; process.stdout.write(`  ${q} ${c.d}(画面には出ません)${c.n}: `); const a = (await nextLine()).trim(); muted = false; process.stdout.write("\n"); return a; };
const yes = async (q, def = true) => { const a = (await ask(`${q} [${def ? "Y/n" : "y/N"}]`)).toLowerCase(); return a === "" ? def : a.startsWith("y"); };

// ───────── コマンド実行 ─────────
function run(cmd, { capture = false, input, allowFail = false, note } = {}) {
  say(`  ${c.d}$ ${cmd}${c.n}${note ? `  ${c.d}← ${note}${c.n}` : ""}`);
  if (DRY) return { status: 0, out: "" };
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", stdio: capture ? ["pipe", "pipe", "pipe"] : (input != null ? ["pipe", "inherit", "inherit"] : "inherit"), input });
  const out = (r.stdout || "") + (r.stderr || "");
  if (capture && out.trim()) say(out.split("\n").map((l) => "    " + l).join("\n"));
  if (r.status !== 0 && !allowFail) die(`コマンドが失敗しました: ${cmd}\n  出た文字をそのまま、AIか GitHub の Issue に貼って聞いてください。`);
  return { status: r.status, out };
}

// ───────── 状態 ─────────
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const done = (k) => !!state[k];
const mark = (k, v = true) => { state[k] = v; if (!DRY) writeFileSync(STATE, JSON.stringify(state, null, 2)); };

// ───────── 頭脳(ブラウザ版と共通) ─────────
const core = (() => { vm.runInThisContext(readFileSync("docs/assets/wizard-core.js", "utf8")); return globalThis.KairanbanWizardCore; })();

// ───────── 開始 ─────────
say(`\n${c.b}Jag's Kairanban-app  セットアップ（ターミナル版）${c.n}${DRY ? `  ${c.y}[お試し: 何も変更しません]${c.n}` : ""}`);
say(`  ${c.d}${WIN ? "Windows" : "Mac"} / Node ${process.version} / フォルダ ${ROOT}${c.n}`);
const nodeMajor = parseInt(process.versions.node, 10);
if (nodeMajor < 20) die(`Node.js が古いです(${process.version})。https://nodejs.org/ja から「推奨版」を入れ直してください。`);

// 1) 答えを用意する ─────────────────────────────
head("1. 町会の情報");
let S = null, src = "";
const candidates = [argAnswers, "kairanban-setup.json"].filter(Boolean).filter(existsSync).map((p) => resolve(p));
try {
  const dl = join(homedir(), "Downloads");
  if (existsSync(dl)) {
    const found = readdirSync(dl).filter((f) => /^kairanban-setup.*\.json$/.test(f)).map((f) => join(dl, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    candidates.push(...found);
  }
} catch {}
for (const p of candidates) {
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    if (j && j.name && j.appId) {
      say(`  ウィザードで保存した設定が見つかりました:\n    ${p}\n    町会: ${j.name} / アプリID: ${j.appId}`);
      if (await yes("これを使いますか？")) { S = j; src = p; break; }
    }
  } catch {}
}
if (!S) {
  say("  質問に答えてください。あとから直せます。\n");
  S = { os: WIN ? "win" : "mac", useMail: "no", roles: null, glossary: [] };
  S.name = await ask("町会の正式名称(例: みどり町三丁目町会)"); if (!S.name) die("町会の名前は必要です");
  const guessShort = S.name.replace(/(町内会|町会|自治会)$/, "").slice(0, 6);
  S.shortName = await ask("短い名前(ホーム画面のアイコン下・6文字まで)", guessShort);
  for (;;) { S.appId = (await ask("アプリのID(半角小文字・数字・ハイフン。URLの一部になる。例: midori-3)")).toLowerCase(); if (/^[a-z][a-z0-9-]{1,40}$/.test(S.appId)) break; if (closed) die("入力が途中で終わりました。"); warn("半角の小文字・数字・ハイフンだけ。先頭は文字で。"); }
  S.hallName = await ask("会館の名前", S.name.replace(/(町内会|町会|自治会)$/, "") + "会館");
  S.hallAddr = await ask("会館の住所(空でも可)");
  S.lat = await ask("会館の緯度(Googleマップで右クリック。空でも可)");
  S.lng = await ask("会館の経度(空でも可)");
  S.useMail = (await yes("回覧をメールでも届けますか？(独自ドメインが要ります)", false)) ? "yes" : "no";
  if (S.useMail === "yes") { S.mailFrom = await ask("差出人メールアドレス"); S.mailReply = await ask("返信を受け取るメールアドレス"); }
  say(`\n  地名の対訳表(外国語に訳すとき、AIが地名をよその実在の地名に置き換えた実例があります)。\n  英語が分からなければローマ字で構いません。`);
  S.glossary = [];
  for (const ja of [S.name, S.hallName]) { const en = await ask(`「${ja}」の英語の書き方`, ja); S.glossary.push({ ja, en }); }
  S.roles = {}; core.ROLE_KEYS.forEach((r) => { S.roles[r[0]] = r[1]; });
  S.roles.seniors = await ask("老人会の呼び名(例: 寿会・シニアクラブ)", "シニアクラブ");
}
if (!S.roles) { S.roles = {}; core.ROLE_KEYS.forEach((r) => { S.roles[r[0]] = r[1]; }); }
S.os = WIN ? "win" : "mac";
const ID = S.appId;
say(`\n  ${c.b}${S.name}${c.n}(${S.shortName}) / アプリID ${c.b}${ID}${c.n} / メール: ${S.useMail === "yes" ? "使う" : "今は使わない"}`);
if (!(await yes("この内容で進めますか？"))) die("やめました。ウィザードの設定を直すか、もう一度実行して答え直してください。");

// 2) 用意するもの ─────────────────────────────
head("2. 用意するものの確認");
ok(`Node.js ${process.version}`);
if (!existsSync("node_modules")) { say("  部品を取り込みます(数分かかります)。"); run("npm install"); } else ok("部品(node_modules)は取り込み済み");
if (DRY) ok("(お試し) Cloudflare のログイン確認は飛ばします");
else {
  const w = run("npx wrangler whoami", { capture: true, allowFail: true });
  if (w.status !== 0 || !/logged in/i.test(w.out)) {
    say("  Cloudflare にログインします。ブラウザが開くので「Allow」を押してください。");
    run("npx wrangler login");
  } else ok("Cloudflare にログイン済み");
}

// 3) 設定ファイル ─────────────────────────────
head("3. 設定ファイルを書く");
const orgNow = readFileSync("src/shared/org.ts", "utf8");
if (!/name: "みどり町三丁目町会"/.test(orgNow) && !done("wroteFiles")) {
  warn("src/shared/org.ts はすでに書き換えられています。");
  if (!(await yes("上書きしますか？(元は .setup-backup/ に残します)", false))) die("やめました。");
}
if (!DRY) { mkdirSync(".setup-backup", { recursive: true }); copyFileSync("src/shared/org.ts", ".setup-backup/org.ts"); copyFileSync("wrangler.jsonc", ".setup-backup/wrangler.jsonc"); }
// すでに wrangler.jsonc に本物の値があれば引き継ぐ
const wrNow = readFileSync("wrangler.jsonc", "utf8");
const oldId = wrNow.match(/"database_id":\s*"([0-9a-f-]{36})"/)?.[1]; if (oldId && !S.d1id) S.d1id = oldId;
const oldPub = wrNow.match(/"VAPID_PUBLIC_KEY":\s*"(B[A-Za-z0-9_-]{85,88})"/)?.[1]; if (oldPub && !S.vapidPub) S.vapidPub = oldPub;
const write = (p, body) => { if (DRY) { say(`  ${c.d}(お試し) ${p} を書く: ${body.length}文字${c.n}`); return; } writeFileSync(p, body); };
write("src/shared/org.ts", core.genOrg(S)); ok("src/shared/org.ts");
write("wrangler.jsonc", core.genWrangler(S)); ok("wrangler.jsonc"); mark("wroteFiles");

// 4) Cloudflare 側の入れ物 ─────────────────────────────
head("4. データベースと写真の置き場所");
if (S.d1id) ok(`データベースのIDは分かっています: ${S.d1id}`);
else {
  let r = run(`npx wrangler d1 create ${ID}`, { capture: true, allowFail: true });
  let id = core.parseD1(r.out);
  if (!id && /already exists/i.test(r.out)) {
    warn("同じ名前のデータベースがすでにあります。IDを調べます。");
    const l = run("npx wrangler d1 list --json", { capture: true, allowFail: true });
    try { id = (JSON.parse(l.out.slice(l.out.indexOf("["))).find((d) => d.name === ID) || {}).uuid || ""; } catch {}
  }
  if (!id && !DRY) die("データベースのIDが読み取れませんでした。上の文字を貼って聞いてください。");
  S.d1id = id || "(お試し)"; write("wrangler.jsonc", core.genWrangler(S)); ok(`データベース ${ID} → ID を wrangler.jsonc に書きました`);
}
{ const r = run(`npx wrangler r2 bucket create ${ID}-images`, { capture: true, allowFail: true }); if (r.status === 0 || /already exists/i.test(r.out) || DRY) ok(`写真の置き場所 ${ID}-images`); else die("写真の置き場所が作れませんでした。"); }

// 5) 鍵と合言葉(値は画面にもファイルにも残さない) ─────────────────────────────
head("5. 通知の鍵と合言葉");
if (!done("vapid")) {
  let pub = S.vapidPub, prv = "";
  if (!pub) {
    const r = run("node tools/gen-vapid.mjs", { capture: false, note: "(結果は画面に出しません)" });
    if (!DRY) { const g = spawnSync("node", ["tools/gen-vapid.mjs"], { encoding: "utf8" }); pub = core.parseVapidPublic(g.stdout); prv = core.parseVapidPrivate(g.stdout); }
    if (!pub && !DRY) die("通知の鍵が作れませんでした。");
    S.vapidPub = pub || "(お試し)"; write("wrangler.jsonc", core.genWrangler(S)); ok("公開鍵を wrangler.jsonc に書きました");
  }
  if (prv || DRY) { run("npx wrangler secret put VAPID_PRIVATE_KEY", { input: prv, note: "秘密鍵を直接渡す(表示しない)" }); ok("秘密鍵を登録しました(画面にもファイルにも出していません)"); }
  else warn("公開鍵は入っていますが、秘密鍵はこの場に無いので登録できません。通知が届かなければ tools/gen-vapid.mjs で作り直してください。");
  mark("vapid");
} else ok("通知の鍵は登録済み");
if (!done("session")) { const s = randomBytes(48).toString("base64url"); run("npx wrangler secret put SESSION_SECRET", { input: s, note: "でたらめな文字列を自動で作って渡す(覚える必要なし)" }); ok("SESSION_SECRET を登録しました"); mark("session"); } else ok("SESSION_SECRET は登録済み");
if (!done("setupCode")) {
  say(`\n  ${c.b}最初の管理者になるための合言葉${c.n}を決めてください。これを知っている人は管理者になれます。誰にも教えないでください。`);
  let code = "";
  if (DRY) { say(`  ${c.d}(お試し) ここで合言葉を聞きます${c.n}`); code = "(お試し)"; }
  else for (;;) {
    code = await askSecret("合言葉(8文字以上)");
    if (code.length >= 8) break;
    if (closed) die("入力が途中で終わりました。もう一度実行してください。");
    warn("8文字以上にしてください。");
  }
  run("npx wrangler secret put SETUP_CODE", { input: code, note: "合言葉を直接渡す(表示しない)" }); ok("合言葉を登録しました"); mark("setupCode");
} else ok("合言葉は登録済み");
if (S.useMail === "yes" && !done("resend")) {
  say("\n  メール送信(Resend)のAPIキーを貼ってください。まだ無ければ空のままEnterで飛ばせます(あとから登録できます)。");
  const k = DRY ? "" : await askSecret("RESEND_API_KEY");
  if (k) { run("npx wrangler secret put RESEND_API_KEY", { input: k }); ok("RESEND_API_KEY を登録しました"); mark("resend"); } else warn("飛ばしました。あとで `npx wrangler secret put RESEND_API_KEY`");
}

// 6) 表に出す ─────────────────────────────
head("6. 表に出す");
say("  データベースの表を作ります。「Ok to proceed?」と聞かれたら y を押してEnter。");
run(`npx wrangler d1 migrations apply ${ID} --remote`);
run("npm run build");
let url = state.url || "";
{ const r = run("npx wrangler deploy", { capture: true }); url = core.parseDeployUrl(r.out) || url; }
if (!url && !DRY) die("公開はできましたが、アドレスが読み取れませんでした。上の文字の https://…workers.dev を控えてください。");
if (url) { mark("url", url); S.appUrl = url; }
if (url && /YOUR_ACCOUNT/.test(readFileSync("wrangler.jsonc", "utf8"))) {
  const patched = readFileSync("wrangler.jsonc", "utf8").replace(/https:\/\/[a-z0-9-]+\.YOUR_ACCOUNT\.workers\.dev/, url);
  write("wrangler.jsonc", patched); ok("wrangler.jsonc の APP_URL を実際のアドレスにしました");
  run("npx wrangler deploy", { capture: true, note: "アドレスを反映するためもう一度" });
}

// 7) おわり ─────────────────────────────
head("できました");
say(`
  あなたの町会のアプリ:  ${c.b}${url || "(お試し)"}${c.n}

  次に、自分を管理者にします。
    1. ブラウザで ${c.b}${(url || "https://….workers.dev")}/admin${c.n} を開く
    2. さっき決めた合言葉を入れる

  そのあと(急ぎません):
    - ごみの日・防災 … 管理画面の「ページ」に日本語で書いて「翻訳を更新」。5言語になります
    - 使い方ページの画面写真 … public/help/ を自分の町会のものに
  ${S.useMail === "yes" ? "  - メール … resend.com でドメインを登録し、RESEND_API_KEY を登録(飛ばした場合)\n" : ""}
  ${c.d}この設定は .setup-state.json / .setup-backup/ に控えがあります(公開リポジトリには入りません)。${c.n}
`);
rl.close();
