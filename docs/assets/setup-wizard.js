// セットアップ ウィザード。ブラウザの中だけで動く。どこにも送らない。
//
// ⚠ ここで作る org.ts / wrangler.jsonc は、リポジトリの実物と**同じ形**でなければ意味がない。
//   実物を変えたら、下の ORG_TEMPLATE / WR_TEMPLATE も同じように変えること。
//   (tools/check-wizard-sync.mjs が食い違いを検出する)
(function () {
  "use strict";
  var KEY = "kairanban.wizard.v1";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ───────── 既定値(実物の org.ts と同じ) ─────────
  var ROLE_KEYS = [
    ["member", "町内会員", "ふつうの会員"],
    ["kodomo_parent", "子ども会保護者", "子ども会の保護者"],
    ["kodomo_officer", "子ども会役員", "子ども会の役員"],
    ["seniors", "シニアクラブ", "老人会・寿会など"],
    ["officer", "町内会役員", "町会の役員"],
    ["hall_manager", "会館係", "会館の予約をさばく係"],
    ["circular_manager", "回覧担当", "回覧を作る係"],
    ["pr", "広報", "広報"],
    ["senior_officer", "上級役員(副管理者)", "副管理者"],
    ["hall_user", "会館予約者", "会館だけ使う人(会員外)"],
    ["observer", "オブザーバー", "見るだけの人"],
    ["admin", "管理者", "管理者"]
  ];

  var S = load() || {};
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function q(s) { return (s == null ? "" : String(s)); }
  function esc(s) { return q(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
  function escHtml(s) { return q(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // ───────── 1. パソコン ─────────
  var ua = navigator.userAgent;
  var guess = /Windows/i.test(ua) ? "win" : (/Mac|iPhone|iPad/i.test(ua) ? "mac" : "");
  if (!S.os && guess) S.os = guess;
  var og = $("#os-guess");
  if (og && guess) og.textContent = "（この画面は " + (guess === "win" ? "Windows" : "Mac") + " で開かれているようです）";

  // ───────── 汎用: ラジオ ─────────
  function bindRadio(name) {
    $$('input[name="' + name + '"]').forEach(function (r) {
      r.checked = (S[name] === r.value);
      r.addEventListener("change", function () { S[name] = r.value; save(); refresh(); });
    });
  }
  ["os", "hasNode", "hasGit", "hasCf", "useMail"].forEach(bindRadio);
  if (!S.useMail) { S.useMail = "no"; $$('input[name="useMail"]').forEach(function (r) { r.checked = r.value === "no"; }); }

  // ───────── 汎用: テキスト ─────────
  var TEXT = { "f-name": "name", "f-short": "shortName", "f-appid": "appId", "f-area": "areaNote",
               "f-hall": "hallName", "f-hall-addr": "hallAddr", "f-lat": "lat", "f-lng": "lng",
               "f-mail-from": "mailFrom", "f-mail-reply": "mailReply", "f-d1out": "d1out", "f-vapidout": "vapidout" };
  Object.keys(TEXT).forEach(function (id) {
    var el = $("#" + id); if (!el) return;
    var k = TEXT[id];
    if (S[k] != null) el.value = S[k];
    else if (el.tagName === "INPUT" && el.value) S[k] = el.value; // 既定文言
    el.addEventListener("input", function () { S[k] = el.value; save(); onInput(k); });
  });
  function onInput(k) {
    if (k === "name" && !S.shortNameTouched) {
      // 短い名前を推測(「町会」「町内会」「自治会」を落として6文字まで)
      var s = q(S.name).replace(/(町内会|町会|自治会)$/, "");
      $("#f-short").value = S.shortName = s.slice(0, 6);
    }
    if (k === "shortName") S.shortNameTouched = true;
    if (k === "appId") { $("#appid-echo").textContent = S.appId || "midori-3"; $$("[data-echo=appid]").forEach(function (e) { e.textContent = S.appId || "midori-3"; }); }
    if (k === "d1out") parseD1();
    if (k === "vapidout") parseVapid();
    if (k === "name" || k === "hallName") seedGlossary();
    save();
  }

  // ───────── 時間 ─────────
  ["f-open", "f-close"].forEach(function (id, i) {
    var sel = $("#" + id); if (!sel) return;
    for (var h = 0; h <= 24; h++) { var o = document.createElement("option"); o.value = h; o.textContent = h + "時"; sel.appendChild(o); }
    var k = i === 0 ? "openHour" : "closeHour";
    if (S[k] == null) S[k] = i === 0 ? 8 : 22;
    sel.value = S[k];
    sel.addEventListener("change", function () { S[k] = parseInt(sel.value, 10); save(); });
  });

  // ───────── 区分の呼び名 ─────────
  if (!S.roles) { S.roles = {}; ROLE_KEYS.forEach(function (r) { S.roles[r[0]] = r[1]; }); }
  var rt = $("#roles tbody");
  if (rt) ROLE_KEYS.forEach(function (r) {
    var tr = document.createElement("tr");
    tr.innerHTML = '<th><span>' + escHtml(r[2]) + '</span><br><span class="key">' + r[0] + '</span></th><td><input type="text" data-role="' + r[0] + '"></td>';
    rt.appendChild(tr);
    var inp = $("input", tr); inp.value = S.roles[r[0]] || r[1];
    inp.addEventListener("input", function () { S.roles[r[0]] = inp.value; save(); });
  });

  // ───────── 対訳表 ─────────
  if (!S.glossary) S.glossary = [];
  var gt = $("#glossary tbody");
  function seedGlossary() {
    // 町会名と会館名の行を、無ければ足す(英語は空のまま。人が入れる)
    var want = [S.name, S.hallName].filter(Boolean);
    // 種を入れるとき、最初に置いた空の行は捨てる(空行が先頭に残ると、入力欄が上に2つ空いて見える)
    if (want.length) S.glossary = S.glossary.filter(function (g) { return q(g.ja).trim() || q(g.en).trim(); });
    want.forEach(function (ja) {
      if (!S.glossary.some(function (g) { return g.ja === ja; })) S.glossary.push({ ja: ja, en: "" });
    });
    renderGlossary();
  }
  function renderGlossary() {
    if (!gt) return;
    gt.innerHTML = "";
    if (!S.glossary.length) S.glossary.push({ ja: "", en: "" }, { ja: "", en: "" });
    S.glossary.forEach(function (g, i) {
      var tr = document.createElement("tr");
      tr.innerHTML = '<td><input type="text" data-g="ja" placeholder="例: みどり町会館"></td><td><input type="text" data-g="en" placeholder="例: Midori Community Hall"></td><td><button type="button" class="del-row" aria-label="この行を消す">✕</button></td>';
      var ja = $('[data-g="ja"]', tr), en = $('[data-g="en"]', tr);
      ja.value = g.ja; en.value = g.en;
      ja.addEventListener("input", function () { g.ja = ja.value; save(); });
      en.addEventListener("input", function () { g.en = en.value; save(); });
      $(".del-row", tr).addEventListener("click", function () { S.glossary.splice(i, 1); save(); renderGlossary(); });
      gt.appendChild(tr);
    });
  }
  renderGlossary();
  var addG = $("#add-gloss"); if (addG) addG.addEventListener("click", function () { S.glossary.push({ ja: "", en: "" }); save(); renderGlossary(); });

  // ───────── コマンド結果の読み取り ─────────
  function parseD1() {
    var m = q(S.d1out).match(/database_id["\s:=]+["']?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
         || q(S.d1out).match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
    S.d1id = m ? m[1] : "";
    var st = $("#d1-status"); if (st) st.textContent = S.d1id ? "✓ IDを読み取りました: " + S.d1id : (q(S.d1out).trim() ? "✗ IDが見つかりません。結果を全部貼ってください" : "まだ貼られていません");
    save();
  }
  function parseVapid() {
    // tools/gen-vapid.mjs は「VAPID_PUBLIC_KEY=…」「VAPID_PRIVATE_KEY=…」の2行を出す。
    // まず名札つきで拾い、名札が欠けて貼られても公開鍵(Bで始まる87文字。P-256の生の点)を拾う。
    // ⚠ 秘密鍵(PKCS8・184文字前後)のほうが**長い**。短い方が公開鍵。
    var m = q(S.vapidout).match(/VAPID_PUBLIC_KEY\s*[=:]\s*"?([A-Za-z0-9_-]{85,90})/)
         || q(S.vapidout).match(/\b(B[A-Za-z0-9_-]{85,88})\b/);
    S.vapidPub = m ? m[1] : "";
    var st = $("#vapid-status"); if (st) st.textContent = S.vapidPub ? "✓ 公開鍵を読み取りました（秘密鍵は使いません）" : (q(S.vapidout).trim() ? "✗ 公開鍵が見つかりません。結果を全部貼ってください" : "まだ貼られていません");
    save();
  }
  parseD1(); parseVapid();

  // ───────── 表示の出し分け ─────────
  function refresh() {
    var os = S.os || guess || "mac";
    $$("[data-os]").forEach(function (e) { e.hidden = e.getAttribute("data-os") !== os; });
    $$("[data-show-if]").forEach(function (e) {
      var kv = e.getAttribute("data-show-if").split("="); e.hidden = S[kv[0]] !== kv[1];
    });
  }

  // ───────── 段の移動 ─────────
  var step = S.step || 1;
  function show(n) {
    step = Math.max(1, Math.min(6, n)); S.step = step; save();
    $$(".wz-step").forEach(function (s) { s.hidden = parseInt(s.getAttribute("data-step"), 10) !== step; });
    $$(".progress span").forEach(function (p) {
      var i = parseInt(p.getAttribute("data-p"), 10);
      p.className = i < step ? "done" : (i === step ? "now" : "");
    });
    if (step === 6) build();
    refresh();
    var top = $('.wz-step[data-step="' + step + '"]');
    if (top) top.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function validate3() {
    var ok = true;
    function bad(id, cond) { var el = $("#" + id); if (!el) return; el.classList.toggle("bad", !!cond); if (cond) ok = false; }
    bad("f-name", !q(S.name).trim());
    bad("f-short", !q(S.shortName).trim() || q(S.shortName).length > 8);
    bad("f-appid", !/^[a-z][a-z0-9-]{1,40}$/.test(q(S.appId)));
    bad("f-lat", q(S.lat).trim() && isNaN(parseFloat(S.lat)));
    bad("f-lng", q(S.lng).trim() && isNaN(parseFloat(S.lng)));
    if (!ok) { var first = $(".bad"); if (first) first.focus(); }
    return ok;
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("button,a") : null; if (!t) return;
    if (t.hasAttribute("data-next")) { if (step === 3 && !validate3()) return; show(step + 1); }
    if (t.hasAttribute("data-prev")) show(step - 1);
    if (t.id === "reset") { if (confirm("入れた内容を全部消して、最初からやり直しますか？")) { try { localStorage.removeItem(KEY); } catch (x) {} location.reload(); } }
    if (t.hasAttribute("data-tab")) {
      $$("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b === t)); });
      $$(".panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== t.getAttribute("data-tab"); });
    }
    if (t.hasAttribute("data-copy") || t.hasAttribute("data-copy-prev")) {
      var src = t.hasAttribute("data-copy") ? $(t.getAttribute("data-copy")) : t.closest(".code").querySelector("pre");
      copyText(src.textContent, t);
    }
    if (t.hasAttribute("data-dl")) {
      var pre = $(t.getAttribute("data-dl"));
      var blob = new Blob([pre.textContent], { type: "text/plain;charset=utf-8" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = t.getAttribute("data-fn"); document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
  });
  function copyText(text, btn) {
    var done = function () { var was = btn.textContent; btn.textContent = "コピーしました"; btn.setAttribute("data-done", "1"); setTimeout(function () { btn.textContent = was; btn.removeAttribute("data-done"); }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    else fallback();
    function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (x) {} ta.remove(); }
  }

  // ───────── 生成: org.ts ─────────
  function genOrg() {
    var lat = q(S.lat).trim() ? parseFloat(S.lat) : 35.681236;
    var lng = q(S.lng).trim() ? parseFloat(S.lng) : 139.767125;
    var latNote = q(S.lat).trim() ? "" : "    // ⚠ 緯度・経度が未入力だったので、仮に東京駅の位置になっています。あとで直してください。\n";
    var roles = ROLE_KEYS.map(function (r) {
      var extra = r[0] === "seniors" ? " // 老人会・寿会など、地域の呼び方に合わせて" : "";
      return "    " + r[0] + ': "' + esc(S.roles[r[0]] || r[1]) + '",' + extra;
    }).join("\n");
    var gl = S.glossary.filter(function (g) { return q(g.ja).trim(); }).map(function (g) {
      return '    { ja: "' + esc(g.ja.trim()) + '", en: "' + esc((g.en || "").trim() || g.ja.trim()) + '" },';
    }).join("\n");
    if (!gl) gl = '    { ja: "' + esc(S.name) + '", en: "' + esc(S.name) + '" },';
    return [
      "// ============================================================",
      "//  ここを書き換えれば、あなたの町会のアプリになります",
      "// ============================================================",
      "//",
      "// このファイルは「町会ごとに変わるもの」を1か所に集めたものです。",
      "// プログラムの知識がなくても、\"\" の中の文字と数字を書き換えるだけで済みます。",
      "//",
      "// ✎ このファイルは kairanban.jagproject.com のセットアップ ウィザードで作られました。",
      "//",
      "// このほかに書き換える場所は、次の1つだけです:",
      "//   1. wrangler.jsonc … アプリの名前・データベースID・メールの送信元",
      "//",
      "// 立ち上げのとき、これ以外のファイルは触らなくて構いません。",
      "// あとから必要になったら足すもの(急ぎません):",
      "//   - ごみの日・防災 … 管理画面の「ページ」で書けます。ファイルは触りません",
      "//   - src/shared/lifeinfo.ts … 区の多言語PDFまで並べたい町会だけ(上級者向け)",
      "//   - src/server/areaalerts.ts … 自治体の防災メールを取り込む場合のみ",
      "//",
      "// 書き換えたら `npm run build` → `npx wrangler deploy` で反映されます。",
      "",
      "export const ORG = {",
      "  /** 町会の正式名称。画面の見出しとメールの差出人に出ます */",
      '  name: "' + esc(S.name) + '",',
      "",
      "  /** ホーム画面のアイコンの下に出る短い名前(全角6文字くらいまで) */",
      '  shortName: "' + esc(S.shortName) + '",',
      "",
      "  /** 会員になれる範囲の説明。入会案内に出ます */",
      '  areaNote: "' + esc(S.areaNote || "対象エリアにお住まいなら、あなたも会員になれます。ぜひご参加ください。") + '",',
      "",
      "  /** 住所を入力してもらうときの、町名より後ろの書き方の例 */",
      '  addressPlaceholder: "例: 1-2-3 / 1-2-3 ○○マンション101",',
      "",
      "  /** 会館(集会所)の情報。予約機能で使います */",
      "  hall: {",
      '    name: "' + esc(S.hallName || (S.name + "会館")) + '",',
      '    address: "' + esc(S.hallAddr || "") + '",',
      "    /** 地図に出す位置。Googleマップで右クリック→座標をコピーで調べられます */",
      latNote + "    lat: " + lat + ",",
      "    lng: " + lng + ",",
      "    /** 使える時間 */",
      "    openHour: " + (S.openHour == null ? 8 : S.openHour) + ",",
      "    closeHour: " + (S.closeHour == null ? 22 : S.closeHour) + ",",
      "  },",
      "",
      "  /**",
      "   * 会員対象エリアの範囲(地図に色を塗る場所)。",
      "   * 外周を順番に [緯度, 経度] で並べます。3点以上。",
      "   * 地図を出したくない場合は空配列 [] にしてください。",
      "   * ✎ ウィザードでは聞いていないので空です。必要になったら足してください。",
      "   */",
      "  areaPolygon: [] as [number, number][],",
      "",
      "  /**",
      "   * 会員の区分(レベル)の呼び名。",
      "   * ⚠ 左側のキーは変えないでください。右側の表示名だけ変えられます。",
      "   * 使わない区分は、そのままにしておけば画面に出るだけで実害はありません。",
      "   */",
      "  roleLabels: {",
      roles,
      "  },",
      "",
      "  /**",
      "   * 地名・施設名の対訳表(外国語に翻訳するときに使います)。",
      "   *",
      "   * ⚠ ここを書き換えないと、**AIが地名を別の実在の地名に訳してしまうこと**があります。",
      "   *   実際に、区名と神社名がよその土地の名前に置き換わった例がありました。",
      "   *   防災の案内で行き先が変わるので、実害になります。",
      "   */",
      "  glossary: [",
      gl,
      "  ] as { ja: string; en: string }[],",
      "};",
      "",
      "/** 翻訳の指示文に差し込む形にした対訳表。翻訳の処理から使います */",
      "export function glossaryLine(): string {",
      "  return ORG.glossary.map((g) => `${g.ja} = ${g.en}`).join(\", \");",
      "}",
      ""
    ].join("\n");
  }

  // ───────── 生成: wrangler.jsonc ─────────
  function genWrangler() {
    var id = S.appId || "kairanban";
    var mail = S.useMail === "yes";
    var from = mail && q(S.mailFrom).trim() ? esc(S.name) + " <" + esc(S.mailFrom.trim()) + ">" : "";
    var reply = mail && q(S.mailReply).trim() ? esc(S.mailReply.trim()) : "";
    var subj = q(S.mailReply).trim() ? "mailto:" + esc(S.mailReply.trim()) : "mailto:you@example.com";
    return [
      "{",
      '  "$schema": "node_modules/wrangler/config-schema.json",',
      "  // ✎ kairanban.jagproject.com のセットアップ ウィザードで作ったファイルです。",
      "  // アプリの名前(Workerの名前。URLの一部になる)",
      '  "name": "' + id + '",',
      '  "main": "src/server/index.ts",',
      '  "compatibility_date": "2026-07-01",',
      '  "assets": {',
      '    "directory": "dist/client",',
      '    "binding": "ASSETS",',
      '    "not_found_handling": "single-page-application",',
      "    // ⚠ SPAフォールバックは「ブラウザが画面として開いたリクエスト(Accept: text/html)」を",
      "    //   Workerより先に横取りして index.html を返してしまう。",
      "    //   メール内の「確認しました」(/api/e/...)や資料の共有リンク(/s/...)は",
      "    //   まさに画面として開かれるので、必ずWorkerを先に通す。",
      "    //   これを外すと、メールの確認ボタンと共有リンクが黙ってトップページになる。",
      '    "run_worker_first": ["/api/*", "/s/*"]',
      "  },",
      '  "d1_databases": [',
      "    {",
      '      "binding": "DB",',
      '      "database_name": "' + id + '",',
      (S.d1id ? "" : "      // ⚠ `npx wrangler d1 create " + id + "` の結果のIDに置き換える\n") +
      '      "database_id": "' + (S.d1id || "YOUR_D1_DATABASE_ID") + '",',
      '      "migrations_dir": "migrations"',
      "    }",
      "  ],",
      "  // 多言語翻訳(Workers AI)。使わない場合も残して問題ない",
      '  "ai": { "binding": "AI" },',
      '  "r2_buckets": [',
      "    // ⚠ `npx wrangler r2 bucket create " + id + "-images` を実行してから使う",
      '    { "binding": "IMAGES", "bucket_name": "' + id + '-images" }',
      "  ],",
      '  "vars": {',
      "    // 町会の名前(画面とメールに表示される)",
      '    "APP_NAME": "' + esc(S.name) + '",',
      "    // 1=開発用ログインを有効化(本番では必ず0)",
      '    "DEV_MODE": "0",',
      "    // LIFF ID(LINEミニアプリを使う場合のみ。LINE Developersで発行)",
      '    "LIFF_ID": "",',
      "    // Web Push(VAPID)公開鍵。`node tools/gen-vapid.mjs` で作る。",
      "    // 秘密鍵は `npx wrangler secret put VAPID_PRIVATE_KEY` で設定する",
      '    "VAPID_PUBLIC_KEY": "' + (S.vapidPub || "YOUR_VAPID_PUBLIC_KEY") + '",',
      '    "VAPID_SUBJECT": "' + subj + '",',
      mail ? "    // 回覧メールの送信元(Resendでドメイン認証が済んだアドレス)。返信先は実在するメールボックスにする"
           : "    // メールは使わない設定です(空のまま)。使うときは Resend で認証したアドレスを入れる",
      '    "MAIL_FROM": "' + from + '",',
      '    "MAIL_REPLY_TO": "' + reply + '",',
      "    // メール内リンクの絶対URL(デプロイ後に出るURLに置き換える)",
      '    "APP_URL": "https://' + id + '.YOUR_ACCOUNT.workers.dev"',
      "  },",
      '  "observability": { "enabled": true },',
      "  // 5分ごと: 会館予約のお知らせ(「終了10分前」を出すため細かく回す)。",
      "  // 日次リマインドは内部の20時間ガードで1日1回だけ動く。",
      '  "triggers": { "crons": ["*/5 * * * *"] }',
      "  // Secrets(`npx wrangler secret put 名前` で設定):",
      "  //   SESSION_SECRET            セッション署名鍵(長いランダム文字列)",
      "  //   SETUP_CODE                初回管理者登録コード",
      "  //   VAPID_PRIVATE_KEY         Web Push秘密鍵",
      "  //   RESEND_API_KEY            メール送信(Resend)のAPIキー(メールを使う場合)",
      "  //   LINE_CHANNEL_ACCESS_TOKEN LINE通知用(使う場合のみ)",
      "  //   LINE_CHANNEL_SECRET       LINE Webhook署名検証用(使う場合のみ)",
      "  //   LINE_LOGIN_CHANNEL_ID     LINEログイン用(使う場合のみ)",
      "  //   LINE_LOGIN_CHANNEL_SECRET LINEログイン用(使う場合のみ)",
      "}",
      ""
    ].join("\n");
  }

  // ───────── 生成: 手順 ─────────
  function genSteps() {
    var os = S.os || guess || "mac", win = os === "win";
    var term = win ? "コマンドプロンプト" : "ターミナル";
    var id = S.appId || "kairanban";
    var L = [];
    function step(h, p, cmds) { L.push({ h: h, p: p, cmds: cmds || [] }); }
    step(term + " を開く", win ? "スタートを押して「cmd」と打ち、「コマンドプロンプト」を開きます。" : "「アプリケーション」→「ユーティリティ」→「ターミナル」。または Spotlight（⌘＋スペース）で「ターミナル」。");
    step("アプリを手元に持ってくる", "3行を、1行ずつ貼ってEnter。3行目は数分かかります。", [
      "git clone https://github.com/jagyamamoto/kairanban-app.git", "cd kairanban-app", "npm install"]);
    step("Cloudflare にログインする", "ブラウザが開くので「Allow」を押します。", ["npx wrangler login"]);
    if (!S.d1id) step("データベースを作る", "出てきた文字の中の <code>database_id = \"…\"</code> の中身を控えます（ウィザードの5段目に貼れば自動で入ります）。", ["npx wrangler d1 create " + id]);
    step("写真の置き場所を作る", "", ["npx wrangler r2 bucket create " + id + "-images"]);
    step("設定ファイル2つを置き換える", "上の <strong>org.ts</strong> タブの内容で <code>src/shared/org.ts</code> を、<strong>wrangler.jsonc</strong> タブの内容で <code>wrangler.jsonc</code> を、それぞれ<strong>中身ごと置き換え</strong>ます。「ダウンロード」で保存して上書きしても構いません。" + (S.d1id ? "" : "<br>⚠ <code>YOUR_D1_DATABASE_ID</code> を、前の段で控えたIDに書き換えてください。"));
    if (!S.vapidPub) step("通知の鍵を作る", "2行出ます。<code>VAPID_PUBLIC_KEY=</code> の後ろ（短い方）を <code>wrangler.jsonc</code> の <code>YOUR_VAPID_PUBLIC_KEY</code> に貼ります。<code>VAPID_PRIVATE_KEY=</code> の後ろ（長い方）は次の段で使います。", ["node tools/gen-vapid.mjs"]);
    step("秘密鍵を登録する", "実行すると入力待ちになります。<strong>秘密鍵</strong>（" + (S.vapidPub ? "ウィザード5段目で貼った結果の中の、<code>VAPID_PRIVATE_KEY=</code> の後ろの長い文字" : "前の段で出た <code>VAPID_PRIVATE_KEY=</code> の後ろの長い文字") + "）を貼ってEnter。画面には残りません。", ["npx wrangler secret put VAPID_PRIVATE_KEY"]);
    step("合言葉を2つ決める", "1つ目は<strong>30文字以上の、でたらめな文字列</strong>（パスワード生成ツールで作ったものでよい）。2つ目は<strong>最初の管理者になるための合言葉</strong>。誰にも教えないでください。", [
      "npx wrangler secret put SESSION_SECRET", "npx wrangler secret put SETUP_CODE"]);
    step("表に出す", "2行目が終わると <code>https://….workers.dev</code> が出ます。<strong>これがあなたの町会のアプリのアドレス</strong>です。控えてください。", [
      "npx wrangler d1 migrations apply " + id + " --remote", "npm run build && npx wrangler deploy"]);
    step("アドレスを設定ファイルに書き戻す", "<code>wrangler.jsonc</code> の <code>APP_URL</code> を、いま出たアドレスに書き換えて、もう一度これを実行します（メール内のリンクに使います）。", ["npm run build && npx wrangler deploy"]);
    step("自分を管理者にする", "出たアドレスの後ろに <code>/admin</code> を付けてブラウザで開き、2つ目の合言葉（SETUP_CODE）を入れます。<strong>これで完成です。</strong>");
    step("ごみの日・防災を載せる（あとでよい）", "管理画面の「ページ」→「＋ 新しいページを作る」。スラッグ <code>seikatsu</code>、タイトル「ごみの日・防災」、本文は自治体のホームページの内容を日本語で。「下書きを作成」→「公開する」→<strong>「翻訳を更新」</strong>。5言語になります。");
    if (S.useMail === "yes") step("メールを送れるようにする（あとでよい）", "<a href='https://resend.com' target='_blank' rel='noopener'>resend.com</a> でアカウントを作り、ドメインを登録して、表示されたDNSの設定をします。⚠ ここは町会のホームページやメールが止まることがある作業です。不安なら詳しい方と。終わったら次を実行してAPIキーを貼ります。", ["npx wrangler secret put RESEND_API_KEY"]);
    return L;
  }

  // ───────── 生成: AIへの文 ─────────
  function genAiCode() {
    var os = (S.os || guess) === "win" ? "Windows" : "Mac";
    return [
      "私の町内会用に、Jag's Kairanban-app（https://github.com/jagyamamoto/kairanban-app）を立ち上げてください。",
      "",
      "私はプログラミングが分かりません。専門用語を使わず、質問は必ず Yes/No か A/B/C の選択肢にしてください。",
      "私に何かさせるときは、1回に1つの動作だけ、押す場所まで書いてください。私のパソコンは " + os + " です。",
      "",
      "## 先に決めてある内容",
      "",
      "町会の情報は決めてあります。**下の2つのファイルを、そのままの内容で書き込んでください。**",
      "（kairanban.jagproject.com のセットアップ ウィザードで作ったものです。中身を変えないでください）",
      "",
      "### src/shared/org.ts",
      "```ts",
      genOrg().trim(),
      "```",
      "",
      "### wrangler.jsonc",
      "```jsonc",
      genWrangler().trim(),
      "```",
      "",
      "## 進め方",
      "",
      "1. まだなら `git clone https://github.com/jagyamamoto/kairanban-app.git` して、そのフォルダで作業する",
      "2. `docs/セットアップ手順.md` を全部読む",
      "3. 上の2つのファイルを書き込む",
      "4. 手順書のステップ4（Cloudflareにログイン）から順に進める。ターミナルで実行するコマンドは、私がそのまま貼れる形で1つずつ出す",
      "5. Cloudflareへのログイン、合言葉の入力など、**私自身の操作が必要なところだけ**私にやってもらう",
      (S.d1id ? "6. データベースのIDは wrangler.jsonc に入れてあるので、`d1 create` は要らない" : "6. `npx wrangler d1 create` の結果のIDを wrangler.jsonc の YOUR_D1_DATABASE_ID に入れる"),
      (S.vapidPub ? "7. 通知の公開鍵は wrangler.jsonc に入れてあるので、秘密鍵の登録（`wrangler secret put VAPID_PRIVATE_KEY`）だけ私に案内する" : "7. `node tools/gen-vapid.mjs` の公開鍵を wrangler.jsonc に入れ、秘密鍵は `wrangler secret put` で私に登録させる"),
      "8. 公開後に出た URL を wrangler.jsonc の APP_URL に書き戻して、もう一度公開する",
      "",
      "## やらないこと",
      "",
      "- 上の2つ以外のファイルは、手順書に書いてある場合を除いて変えない",
      "- 合言葉・APIキー・秘密鍵の値を、チャットに書かせない・ファイルに書き込まない（`wrangler secret put` で私が直接入れる）",
      "- `src/shared/lifeinfo.ts` は触らない（ごみの日は管理画面のページで載せる）",
      "- 勝手に git push しない",
      "",
      "## 終わったら",
      "",
      "- アプリのURLと、`/admin` で管理者になる手順を、押す場所まで書く",
      "- 変えたファイルと、迷って決めたことを箇条書きで報告する",
      ""
    ].join("\n");
  }
  function genAiChat() {
    var os = (S.os || guess) === "win" ? "Windows（コマンドプロンプト）" : "Mac（ターミナル）";
    return [
      "町内会のアプリ Jag's Kairanban-app（https://github.com/jagyamamoto/kairanban-app）を、",
      "手順書（docs/セットアップ手順.md）のとおり自分で立ち上げています。私はプログラミングが分かりません。",
      "専門用語を使わず、次に私が打つことを1つだけ教えてください。私のパソコンは " + os + " です。",
      "",
      "いまやっている段: 【例: ステップ10「表に出す」の1行目】",
      "",
      "打ったコマンド:",
      "【ここに貼る】",
      "",
      "出た文字（エラー）を全部そのまま:",
      "【ここに貼る】",
      "",
      "⚠ 合言葉・APIキー・秘密鍵は貼っていません。もし上の中に含まれていたら、使わずに「消してください」と言ってください。",
      ""
    ].join("\n");
  }

  // ───────── 6. 組み立て ─────────
  function build() {
    var id = S.appId || "kairanban";
    $("#summary").innerHTML = "<b>" + escHtml(S.name || "（町会名が未入力）") + "</b>（短い名前: " + escHtml(S.shortName || "—") + "） / アプリID <b>" + escHtml(id) + "</b> / " +
      ((S.os || guess) === "win" ? "Windows" : "Mac") + " / メール: " + (S.useMail === "yes" ? "使う" : "今は使わない") +
      " / データベースID: " + (S.d1id ? "入力済" : "あとで") + " / 通知の鍵: " + (S.vapidPub ? "入力済" : "あとで");
    $("#out-org").textContent = genOrg();
    $("#out-wr").textContent = genWrangler();
    var holes = [];
    if (!S.d1id) holes.push("<code>YOUR_D1_DATABASE_ID</code> … 手順の「データベースを作る」で出るIDに書き換える（5段目に貼れば自動で入ります）");
    if (!S.vapidPub) holes.push("<code>YOUR_VAPID_PUBLIC_KEY</code> … 手順の「通知の鍵を作る」で出る公開鍵に書き換える（同上）");
    holes.push("<code>APP_URL</code> … 最初の公開が終わると分かるURLに書き換える（手順に入っています）");
    $("#wr-holes").innerHTML = '<div class="gold-card"><span class="tag">あとで埋めるところ ' + holes.length + 'か所</span><ul style="margin:0;padding-left:1.2em">' + holes.map(function (h) { return "<li>" + h + "</li>"; }).join("") + "</ul></div>";
    var ol = $("#steps-list"); ol.innerHTML = "";
    genSteps().forEach(function (s) {
      var li = document.createElement("li");
      li.innerHTML = "<h4>" + s.h + "</h4>" + (s.p ? "<p>" + s.p + "</p>" : "") +
        s.cmds.map(function (c) { return '<div class="code"><pre>' + escHtml(c) + '</pre><div class="tools"><button class="mini" data-copy-prev>コピー</button></div></div>'; }).join("");
      ol.appendChild(li);
    });
    $("#out-ai-code").textContent = genAiCode();
    $("#out-ai-chat").textContent = genAiChat();
  }

  // ───────── 起動 ─────────
  if (S.name) onInput("name"); // 対訳表の種
  if (S.appId) onInput("appId");
  show(step);
})();
