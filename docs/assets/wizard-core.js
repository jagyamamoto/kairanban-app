// セットアップ ウィザードの「頭脳」。ブラウザ(docs/setup-wizard.html)と
// ターミナル版(tools/setup.mjs)の**両方がこれを使う**。実物の org.ts / wrangler.jsonc の
// ひな形はここ1か所にしか無い。
//
// ⚠ 実物のファイルに項目を足したら、ここも同じように直す(tools/check-wizard-sync.mjs が落ちる)。
// ⚠ classic script にしてある(type="module" にすると file:// で開いたとき Chrome が拒む)。
//   Node からは vm.runInThisContext で読み込んで globalThis.KairanbanWizardCore を使う。
(function (root) {
  "use strict";
  function q(s) { return (s == null ? "" : String(s)); }
  function esc(s) { return q(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }

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

  // ───────── コマンド結果の読み取り ─────────
  function parseD1(text) {
    var t = q(text);
    var m = t.match(/database_id["\s:=]+["']?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
         || t.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
    return m ? m[1] : "";
  }
  // tools/gen-vapid.mjs は「VAPID_PUBLIC_KEY=…」「VAPID_PRIVATE_KEY=…」の2行を出す。
  // 公開鍵は B で始まる87文字。⚠ 秘密鍵(184文字前後)のほうが長い。
  function parseVapidPublic(text) {
    var t = q(text);
    var m = t.match(/VAPID_PUBLIC_KEY\s*[=:]\s*"?([A-Za-z0-9_-]{85,90})/) || t.match(/\b(B[A-Za-z0-9_-]{85,88})\b/);
    return m ? m[1] : "";
  }
  function parseVapidPrivate(text) {
    var m = q(text).match(/VAPID_PRIVATE_KEY\s*[=:]\s*"?([A-Za-z0-9_-]{100,400})/);
    return m ? m[1] : "";
  }
  function parseDeployUrl(text) {
    var m = q(text).match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i);
    return m ? m[0] : "";
  }

  // ───────── 生成: org.ts ─────────
  function genOrg(S, guess) {
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
  function genWrangler(S, guess) {
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
  function genSteps(S, guess) {
    var os = S.os || guess || "mac", win = os === "win";
    var term = win ? "コマンドプロンプト" : "ターミナル";
    var id = S.appId || "kairanban";
    var L = [];
    function step(h, p, cmds) { L.push({ h: h, p: p, cmds: cmds || [] }); }
    if (S.local) {
      // ZIPを解いたフォルダの中で開いている。取り寄せは済んでいるので、フォルダに入る手順だけ。
      step(term + " を開いて、このフォルダに入る",
        win ? "エクスプローラーでこのフォルダ（ZIPを解いた <code>kairanban-app-main</code>）を開き、<strong>空いているところを Shift＋右クリック</strong> →「ターミナルで開く」（または「PowerShell ウィンドウをここで開く」）。"
            : "「アプリケーション」→「ユーティリティ」→「ターミナル」を開き、<code>cd </code>（cdと空白）と打ってから、<strong>このフォルダをターミナルの窓にドラッグ＆ドロップ</strong>してEnter。");
      step("部品を取り込む", "数分かかります。", ["npm install"]);
    } else {
      step(term + " を開く", win ? "スタートを押して「cmd」と打ち、「コマンドプロンプト」を開きます。" : "「アプリケーション」→「ユーティリティ」→「ターミナル」。または Spotlight（⌘＋スペース）で「ターミナル」。");
      step("アプリを手元に持ってくる", "3行を、1行ずつ貼ってEnter。3行目は数分かかります。", [
        "git clone https://github.com/jagyamamoto/kairanban-app.git", "cd kairanban-app", "npm install"]);
    }
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
  function genAiCode(S, guess) {
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
      genOrg(S, guess).trim(),
      "```",
      "",
      "### wrangler.jsonc",
      "```jsonc",
      genWrangler(S, guess).trim(),
      "```",
      "",
      "## 進め方",
      "",
      (S.local ? "1. いま開いているこのフォルダ（ZIPを解いた kairanban-app-main）で作業する。`npm install` がまだなら実行する" : "1. まだなら `git clone https://github.com/jagyamamoto/kairanban-app.git` して、そのフォルダで作業する"),
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
  function genAiChat(S, guess) {
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


  root.KairanbanWizardCore = { ROLE_KEYS: ROLE_KEYS, genOrg: genOrg, genWrangler: genWrangler, genSteps: genSteps,
    genAiCode: genAiCode, genAiChat: genAiChat, parseD1: parseD1, parseVapidPublic: parseVapidPublic,
    parseVapidPrivate: parseVapidPrivate, parseDeployUrl: parseDeployUrl, q: q, esc: esc };
})(typeof globalThis !== "undefined" ? globalThis : this);
