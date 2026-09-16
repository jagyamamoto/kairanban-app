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
  // ⚠ 頭脳(wizard-core.js)への参照は**いちばん最初**に取る。
  //   下の方に置いていたとき、ROLE_KEYS の代入(15行目)が「C は undefined」で落ち、ページが白くなった。var は巻き上がるが代入は巻き上がらない。
  var C = (typeof globalThis !== "undefined" ? globalThis : window).KairanbanWizardCore;
  if (!C) throw new Error("wizard-core.js が読み込まれていません(setup-wizard.js より前に <script> で読むこと)");

  // ───────── 既定値(実物の org.ts と同じ) ─────────
  var ROLE_KEYS = C.ROLE_KEYS;

  var S = load() || {};
  // ZIPを解いたフォルダの中で開いているか(file:// か ?local=1)。手順が変わる。
  var LOCAL = location.protocol === "file:" || /[?&]local=1(&|$)/.test(location.search);
  S.local = LOCAL;
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function q(s) { return (s == null ? "" : String(s)); }
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
    S.d1id = C.parseD1(S.d1out);
    var st = $("#d1-status"); if (st) st.textContent = S.d1id ? "✓ IDを読み取りました: " + S.d1id : (q(S.d1out).trim() ? "✗ IDが見つかりません。結果を全部貼ってください" : "まだ貼られていません");
    save();
  }
  function parseVapid() {
    S.vapidPub = C.parseVapidPublic(S.vapidout);
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
    if (t.id === "save-json") {
      var keep = {}; ["name","shortName","appId","areaNote","hallName","hallAddr","lat","lng","openHour","closeHour","roles","glossary","useMail","mailFrom","mailReply","d1id","vapidPub","os"].forEach(function (k) { if (S[k] != null) keep[k] = S[k]; });
      keep.savedAt = new Date().toISOString(); keep.from = "kairanban.jagproject.com/setup-wizard";
      var blob = new Blob([JSON.stringify(keep, null, 2)], { type: "application/json;charset=utf-8" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "kairanban-setup.json"; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      t.textContent = "保存しました（ダウンロードフォルダ）"; setTimeout(function () { t.textContent = "設定を保存（kairanban-setup.json）"; }, 2500);
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

  // ───────── 生成(中身は assets/wizard-core.js) ─────────
  function genOrg() { return C.genOrg(S, guess); }
  function genWrangler() { return C.genWrangler(S, guess); }
  function genSteps() { return C.genSteps(S, guess); }
  function genAiCode() { return C.genAiCode(S, guess); }
  function genAiChat() { return C.genAiChat(S, guess); }

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
    var lc = $("#local-card");
    if (lc) {
      lc.hidden = false;
      var fileName = (S.os || guess) === "win" ? "セットアップ.bat" : "セットアップ.command";
      lc.innerHTML = '<span class="tag">' + (LOCAL ? "いちばん楽な方法(このフォルダの中だけで済みます)" : "ZIPを解いたフォルダで進める方法") + '</span>' +
        '<p>①下の<strong>「設定を保存」</strong>を押す（<code>kairanban-setup.json</code> がダウンロードされます）。' +
        '②' + (LOCAL ? "このフォルダ" : "ZIPを解いたフォルダ(kairanban-app-main)") + 'の中の <strong><code>' + fileName + '</code></strong> をダブルクリック。' +
        '③保存した設定を自動で見つけて、あとは<strong>質問に答えるだけ</strong>で公開まで進みます。合言葉は画面に出ず、ファイルにも残りません。</p>' +
        ((S.os || guess) === "win"
          ? '<p class="hint">⚠ Windowsで「WindowsによってPCが保護されました」と出たら、<strong>「詳細情報」→「実行」</strong>。</p>'
          : '<p class="hint">⚠ Macで「開発元を確認できないため開けません」と出たら、ファイルを<strong>右クリック →「開く」</strong>。それでも出たら「システム設定 → プライバシーとセキュリティ → このまま開く」。</p>') +
        '<p class="hint">下の手順を自分で1行ずつ貼っても、同じところに着きます。</p>' +
        '<div class="btn-row"><button type="button" class="btn btn-primary" id="save-json">設定を保存（kairanban-setup.json）</button></div>';
    }
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
