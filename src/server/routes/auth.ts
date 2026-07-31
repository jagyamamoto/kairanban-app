// 認証: LINEログイン(LIFF IDトークン検証)、開発用ログイン、初回管理者登録、自分の情報
import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { verifyGoogleIdToken } from "../googleauth";
import { buildLineAuthUrl, exchangeLineCode } from "../lineauth";
import { mailEnabled } from "../email";
import { sendWebPush } from "../webpush";
import { getCookie } from "hono/cookie";
import {
  type AppEnv,
  type Person,
  HttpError,
  SESSION_COOKIE,
  audit,
  canViewAudience,
  createSessionToken,
  createSignedBlob,
  loginRateLimited,
  recordLoginFailure,
  requireActive,
  requireUser,
  validatePhone,
} from "../core";
import { resetDemoData } from "../demo";

const auth = new Hono<AppEnv>();

function cookieOpts(url: string) {
  return {
    httpOnly: true,
    secure: new URL(url).protocol === "https:",
    sameSite: "Lax" as const,
    path: "/",
    maxAge: 90 * 24 * 3600,
  };
}

// LIFFのIDトークンをLINEサーバーで検証してログイン
auth.post("/line", async (c) => {
  const { idToken, displayName } = await c.req
    .json<{ idToken?: string; displayName?: string }>()
    .catch(() => ({}) as { idToken?: string; displayName?: string });
  if (!idToken) throw new HttpError(400, "idTokenが必要です");
  if (!c.env.LINE_LOGIN_CHANNEL_ID) throw new HttpError(500, "LINEログインが未設定です");
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: c.env.LINE_LOGIN_CHANNEL_ID }),
  });
  if (!res.ok) throw new HttpError(401, "LINEログインの検証に失敗しました");
  const data = (await res.json()) as { sub: string; name?: string };

  let person = await c.env.DB.prepare("SELECT * FROM persons WHERE line_user_id=?")
    .bind(data.sub)
    .first<Person>();
  if (!person) {
    const name = (displayName || data.name || "未設定").slice(0, 50);
    person = (await c.env.DB.prepare(
      "INSERT INTO persons (name, line_user_id, status) VALUES (?, ?, 'pending') RETURNING *",
    )
      .bind(name, data.sub)
      .first<Person>())!;
    await audit(c.env.DB, person.id, "person.register", "person", person.id, { via: "line" });
  }
  if (person.status === "left") throw new HttpError(403, "この利用者は退会済みです");
  setCookie(c, SESSION_COOKIE, await createSessionToken(c.env, person.id), cookieOpts(c.req.url));
  return c.json({ ok: true });
});

// 電話番号でログイン(PWAの主入口)。SMS確認はせず、番号そのものを認証情報とする。
// 電話番号は役員が事前に会員情報へ登録しておく(管理画面「会員」タブ)。
// 総当たり対策として、同一IPからの失敗ログインを1時間あたり20回までに制限する。
auth.post("/phone", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (await loginRateLimited(c.env.DB, ip)) {
    throw new HttpError(429, "試行回数が多すぎます。しばらくしてからお試しください");
  }
  const { phone } = await c.req
    .json<{ phone?: string }>()
    .catch(() => ({}) as { phone?: string });
  const normalized = validatePhone(phone || "");
  const person = await c.env.DB.prepare("SELECT * FROM persons WHERE phone=?")
    .bind(normalized)
    .first<Person>();
  if (!person) {
    await recordLoginFailure(c.env.DB, ip);
    throw new HttpError(401, "登録された電話番号が見つかりません。お手数ですが役員にご確認ください");
  }
  if (person.status === "left") throw new HttpError(403, "この利用者は退会済みです");
  setCookie(c, SESSION_COOKIE, await createSessionToken(c.env, person.id), cookieOpts(c.req.url));
  await audit(c.env.DB, person.id, "auth.phone_login", "person", person.id);
  return c.json({ ok: true });
});

// 初回管理者ブートストラップ(SETUP_CODEを知っている人=導入した管理者のみ。ログイン不要)
auth.post("/admin-setup", async (c) => {
  const { code } = await c.req.json<{ code?: string }>().catch(() => ({}) as { code?: string });
  const setup = (c.env.SETUP_CODE || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normalized = (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!setup || !normalized || normalized !== setup) {
    throw new HttpError(403, "コードが違います");
  }
  let adminPerson = await c.env.DB.prepare(
    `SELECT p.* FROM persons p JOIN role_assignments ra ON ra.person_id=p.id
     WHERE ra.role='admin' AND p.status='active' ORDER BY p.id LIMIT 1`,
  ).first<Person>();
  if (!adminPerson) {
    adminPerson = (await c.env.DB.prepare(
      "INSERT INTO persons (name, status, approved_at) VALUES ('管理者', 'active', datetime('now')) RETURNING *",
    ).first<Person>())!;
    await c.env.DB.prepare(
      "INSERT INTO role_assignments (person_id, role, granted_by) VALUES (?, 'admin', ?)",
    )
      .bind(adminPerson.id, adminPerson.id)
      .run();
    await audit(c.env.DB, adminPerson.id, "auth.setup_admin", "person", adminPerson.id, {
      via: "setup_code",
    });
  }
  setCookie(
    c,
    SESSION_COOKIE,
    await createSessionToken(c.env, adminPerson.id),
    cookieOpts(c.req.url),
  );
  await audit(c.env.DB, adminPerson.id, "auth.admin_setup_login", "person", adminPerson.id);
  return c.json({ ok: true });
});

// 開発用ログイン(DEV_MODE=1のときのみ有効。本番では無効)
auth.post("/dev", async (c) => {
  if (c.env.DEV_MODE !== "1") throw new HttpError(403, "開発用ログインは無効です");
  const { name } = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  if (!name || !name.trim()) throw new HttpError(400, "名前を入力してください");
  let person = await c.env.DB.prepare(
    "SELECT * FROM persons WHERE name=? AND line_user_id IS NULL",
  )
    .bind(name.trim())
    .first<Person>();
  if (!person) {
    person = (await c.env.DB.prepare(
      "INSERT INTO persons (name, status) VALUES (?, 'pending') RETURNING *",
    )
      .bind(name.trim())
      .first<Person>())!;
    await audit(c.env.DB, person.id, "person.register", "person", person.id, { via: "dev" });
  }
  if (person.status === "left") throw new HttpError(403, "この利用者は退会済みです");
  setCookie(c, SESSION_COOKIE, await createSessionToken(c.env, person.id), cookieOpts(c.req.url));
  return c.json({ ok: true });
});

// 初回管理者登録(SETUP_CODEを知っている人=導入した管理者のみ)
auth.post("/setup", async (c) => {
  const u = requireUser(c);
  const { code } = await c.req.json<{ code?: string }>().catch(() => ({}) as { code?: string });
  if (!c.env.SETUP_CODE || code !== c.env.SETUP_CODE) throw new HttpError(403, "コードが違います");
  await c.env.DB.prepare(
    "UPDATE persons SET status='active', approved_at=datetime('now'), approved_by=? WHERE id=?",
  )
    .bind(u.id, u.id)
    .run();
  const has = await c.env.DB.prepare(
    "SELECT 1 AS x FROM role_assignments WHERE person_id=? AND role='admin' AND (end_date IS NULL OR end_date>=date('now'))",
  )
    .bind(u.id)
    .first();
  if (!has) {
    await c.env.DB.prepare(
      "INSERT INTO role_assignments (person_id, role, granted_by) VALUES (?, 'admin', ?)",
    )
      .bind(u.id, u.id)
      .run();
  }
  await audit(c.env.DB, u.id, "auth.setup_admin", "person", u.id);
  return c.json({ ok: true });
});

// Googleログイン(Gmail)。事前に登録されたメールアドレスと突き合わせる。
// 未登録のメールでは**アカウントを勝手に作らない**(役員の承認が要るため)。
auth.post("/google", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (await loginRateLimited(c.env.DB, ip)) {
    throw new HttpError(429, "しばらくしてからもう一度お試しください");
  }
  const b = await c.req.json<{ credential?: string }>().catch(() => ({}) as { credential?: string });
  if (!b.credential) throw new HttpError(400, "ログイン情報がありません");

  const identity = await verifyGoogleIdToken(c.env, b.credential);
  if (!identity) {
    await recordLoginFailure(c.env.DB, ip);
    throw new HttpError(401, "Googleログインを確認できませんでした");
  }

  const p = await c.env.DB.prepare("SELECT * FROM persons WHERE email=?")
    .bind(identity.email)
    .first<Person>();
  if (!p || p.status === "left") {
    await recordLoginFailure(c.env.DB, ip);
    throw new HttpError(
      401,
      "このGoogleアカウントは登録されていません。会員登録を申請するか、役員にメールアドレスの登録をご依頼ください。",
    );
  }

  const token = await createSessionToken(c.env, p.id);
  setCookie(c, SESSION_COOKIE, token, cookieOpts(c.req.url));
  await audit(c.env.DB, p.id, "auth.login_google", "person", p.id);
  return c.json({ ok: true });
});

// ============ LINEログイン(ウェブ・ミニアプリなし) ============
// LINEアプリへ遷移させたりLINE内で動かしたりはしない。本人確認の手段としてだけ使う。
const LINE_STATE_COOKIE = "line_state";
// 会員登録の申請中にLINEの本人情報を預かるCookie(署名つき・30分)
export const SIGNUP_LINE_COOKIE = "signup_line";

// 「LINEでログイン」を押したとき。CSRF対策のstateを発行してLINEの認可画面へ送る。
auth.get("/line/start", async (c) => {
  if (!c.env.LINE_LOGIN_CHANNEL_ID) throw new HttpError(500, "LINEログインが未設定です");
  const q = c.req.query("mode");
  // login=既存会員のログイン / link=ログイン中の会員が連携 / signup=会員登録の申請にLINEを添える
  const mode = q === "link" || q === "signup" ? q : "login";
  const state = `${mode}.${crypto.randomUUID()}`;
  setCookie(c, LINE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  return c.redirect(buildLineAuthUrl(c.env, c.req.url, state));
});

// LINEからの戻り。stateを照合し、コードを検証して本人を特定する。
auth.get("/line/callback", async (c) => {
  const state = c.req.query("state") || "";
  const saved = getCookie(c, LINE_STATE_COOKIE) || "";
  deleteCookie(c, LINE_STATE_COOKIE, { path: "/" });
  const fail = (msg: string) => c.redirect(`/app?line_error=${encodeURIComponent(msg)}`);

  if (!state || state !== saved) return fail("やり直してください");
  const code = c.req.query("code");
  if (!code) return fail("LINEログインが中断されました");

  let identity;
  try {
    identity = await exchangeLineCode(c.env, c.req.url, code);
  } catch {
    return fail("LINEログインに失敗しました");
  }

  const mode = state.split(".")[0];

  // 会員登録の申請中。まだpersonsに行がないので、本人情報を短命の署名付きCookieに預けて
  // 申請フォームへ戻す。フォーム送信時にサーバ側で取り出して結び付ける。
  if (mode === "signup") {
    const taken = await c.env.DB.prepare("SELECT 1 AS x FROM persons WHERE line_user_id=?")
      .bind(identity.sub)
      .first();
    if (taken) return fail("このLINEアカウントはすでに登録されています。そのままログインできます");
    setCookie(
      c,
      SIGNUP_LINE_COOKIE,
      await createSignedBlob(c.env, identity, 30 * 60 * 1000),
      { ...cookieOpts(c.req.url), maxAge: 1800 },
    );
    return c.redirect("/app?signup=line");
  }

  if (mode === "link") {
    // ログイン中の会員が自分のLINEを紐付ける
    const u = c.get("user");
    if (!u || u.status !== "active") return fail("ログインしてから連携してください");
    const taken = await c.env.DB.prepare("SELECT id FROM persons WHERE line_user_id=? AND id<>?")
      .bind(identity.sub, u.id)
      .first();
    if (taken) return fail("このLINEアカウントは他の方が使用しています");
    // メールは申請が通っている場合だけ返る。既に他人が使っていれば入れない。
    let email: string | null = null;
    if (identity.email) {
      const dup = await c.env.DB.prepare("SELECT id FROM persons WHERE email=? AND id<>?")
        .bind(identity.email, u.id)
        .first();
      if (!dup) email = identity.email;
    }
    await c.env.DB.prepare(
      "UPDATE persons SET line_user_id=?, email=COALESCE(?, email) WHERE id=?",
    )
      .bind(identity.sub, email, u.id)
      .run();
    await audit(c.env.DB, u.id, "auth.link_line", "person", u.id);
    return c.redirect("/app?linked=line");
  }

  // ログイン: LINEのユーザーID、なければメールで既存会員を照合する。
  // **未登録なら勝手にアカウントを作らない**(役員の承認が必要な運用のため)。
  let person = await c.env.DB.prepare("SELECT * FROM persons WHERE line_user_id=?")
    .bind(identity.sub)
    .first<Person>();
  if (!person && identity.email) {
    person = await c.env.DB.prepare("SELECT * FROM persons WHERE email=?")
      .bind(identity.email)
      .first<Person>();
    if (person) {
      // メールで一致したら、次回から早く入れるようLINE IDも覚えておく
      await c.env.DB.prepare("UPDATE persons SET line_user_id=? WHERE id=?")
        .bind(identity.sub, person.id)
        .run();
    }
  }
  if (!person || person.status === "left") {
    return fail("このLINEアカウントは登録されていません。会員登録を申請してください");
  }
  setCookie(c, SESSION_COOKIE, await createSessionToken(c.env, person.id), cookieOpts(c.req.url));
  await audit(c.env.DB, person.id, "auth.login_line", "person", person.id);
  return c.redirect("/app");
});

auth.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

export default auth;

// ============ /api/me ============
export const meApp = new Hono<AppEnv>();

meApp.get("/me", async (c) => {
  const u = c.get("user");
  // デモサイトのときだけ、24時間ごとに架空データへ戻す。
  // ⚠ Cronが使えない環境でも動くよう、画面を開いたついでに判定する。
  //   本物の町会(DEMO_MODEなし)では resetDemoData が即座に何もせず返る。
  if (c.env.DEMO_MODE === "1") {
    c.executionCtx.waitUntil(resetDemoData(c.env).catch(() => {}));
  }
  // ホーム画面に追加済みか(監査ログに pwa.installed があるか)。
  // これが true の間は「最初の設定」の案内を出さない。
  let pwaInstalled = false;
  if (u) {
    const row = await c.env.DB.prepare(
      "SELECT 1 AS x FROM audit_log WHERE actor_id=? AND action='pwa.installed' LIMIT 1",
    )
      .bind(u.id)
      .first();
    pwaInstalled = !!row;
  }
  return c.json({
    user: u
      ? {
          id: u.id,
          name: u.name,
          kana: u.kana,
          lang: u.lang,
          status: u.status,
          roles: u.roles,
          is_digital: u.is_digital,
          has_line: !!u.line_user_id,
          hall_early_access: !!u.hall_early_access,
          email: u.email,
          email_optout: !!u.email_optout,
          address: u.address,
          household_head: u.household_head,
          phone: u.phone,
          pwa_installed: pwaInstalled,
        }
      : null,
    config: {
      appName: c.env.APP_NAME,
      liffId: c.env.LIFF_ID || null,
      devMode: c.env.DEV_MODE === "1",
      // デモサイトかどうか(画面に「お試しです」の帯を出すため)
      demoMode: c.env.DEMO_MODE === "1",
      vapidPublicKey: c.env.VAPID_PUBLIC_KEY || null,
      googleClientId: c.env.GOOGLE_CLIENT_ID || null,
      // ⚠ LINEの導線は「メールアドレス取得権限」が有効になるまで画面に出さない(オーナー指示 2026-07-29)。
      // LINEで入ってもメールが取れないと、回覧をメールで送れず中途半端になるため。
      // 審査が通って LINE_EMAIL_SCOPE=1 を入れれば、この1行で自動的に画面へ戻る。
      lineLoginEnabled: !!(
        c.env.LINE_LOGIN_CHANNEL_ID &&
        c.env.LINE_LOGIN_CHANNEL_SECRET &&
        c.env.LINE_EMAIL_SCOPE === "1"
      ),
      mailEnabled: mailEnabled(c.env),
    },
  });
});

// ホーム画面のアイコンから起動したことを記録する。
// Safariで開いたときに「最初の設定」の案内を出さないための判定に使う
// (iOSはSafariとホーム画面アプリで保存領域が別なので、端末側では判定できない)。
meApp.post("/me/installed", async (c) => {
  const u = requireUser(c);
  const has = await c.env.DB.prepare(
    "SELECT 1 AS x FROM audit_log WHERE actor_id=? AND action='pwa.installed' LIMIT 1",
  )
    .bind(u.id)
    .first();
  if (!has) await audit(c.env.DB, u.id, "pwa.installed", "person", u.id);
  return c.json({ ok: true });
});

// いま「確認しました」を押していない回覧を数える。
//
// ⚠ 対象は status='published' だけ。掲載終了日を過ぎた回覧は cron が archived にするので、
//   **期間が過ぎればこの数は自動的に減る**(オーナー指示 2026-07-30 のバッジの仕様)。
// ⚠ 自分に見える回覧だけ数える(audience の絞り込みを会員向け一覧と同じにする)。
async function myUnreadCirculars(
  db: D1Database,
  u: { id: number; roles: string[] },
): Promise<{ count: number; newestTitle: string | null }> {
  const rows = await db
    .prepare(
      `SELECT c.id, c.title, c.audience
         FROM circulars c
         LEFT JOIN circular_confirmations cc
                ON cc.circular_id = c.id AND cc.person_id = ?
        WHERE c.status = 'published'
          AND c.visibility IN ('members','both')
          AND cc.confirmed_at IS NULL
        ORDER BY c.published_at DESC`,
    )
    .bind(u.id)
    .all<{ id: number; title: string; audience: string }>();
  let count = 0;
  let newestTitle: string | null = null;
  for (const r of rows.results) {
    if (!(await canViewAudience(db, r.audience, u as never))) continue;
    if (count === 0) newestTitle = r.title;
    count++;
  }
  return { count, newestTitle };
}

// ホーム画面のアイコンに出す未読の数(オーナー指示 2026-07-30)。
// 画面側で navigator.setAppBadge() に渡す。
meApp.get("/me/badge", async (c) => {
  const u = requireUser(c);
  const { count } = await myUnreadCirculars(c.env.DB, u);
  return c.json({ count });
});

// 自分宛にテスト通知を送る(オーナー指示 2026-07-30)。
//
// 「通知がちゃんと自分に届くか」を会員が自分で確かめられるようにする。
// ⚠ **送れるのは自分宛だけ**。他の人には送れない(person_id を自分に固定している)。
meApp.post("/me/test-push", async (c) => {
  const u = requireUser(c);
  const subs = await c.env.DB.prepare(
    "SELECT id, endpoint FROM push_subscriptions WHERE person_id=?",
  )
    .bind(u.id)
    .all<{ id: number; endpoint: string }>();
  if (subs.results.length === 0) {
    return c.json({
      ok: false,
      message:
        "この端末では通知の準備ができていません。ホーム画面のアイコンから開いて、通知を「許可」にしてください。",
    });
  }
  let sent = 0;
  for (const sub of subs.results) {
    const status = await sendWebPush(c.env, sub.endpoint);
    if (status === 404 || status === 410) {
      // もう使えない登録は消す(端末を替えた・アプリを消した場合)
      await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(sub.id).run();
    } else if (status >= 200 && status < 300) {
      sent++;
    }
  }
  await audit(c.env.DB, u.id, "push.test", "person", u.id, { sent });
  return c.json({
    ok: sent > 0,
    sent,
    message:
      sent > 0
        ? "送りました。数秒でお手元に通知が届きます。届かないときは、通知が「許可」になっているかご確認ください。"
        : "送れませんでした。ホーム画面のアイコンから開いて、通知を「許可」にしてからお試しください。",
  });
});

// 通知に出す文章を Service Worker に渡す(オーナー指示 2026-07-30)。
//
// 【なぜサーバに聞くのか】
// Web Push は本文を暗号化して送る決まりで、Workers から送るのは手間が大きい。
// そこで本文なしの通知を送り、受け取った Service Worker がここに聞いて
// 「〇〇さん、『△△』の回覧通知があります。」を組み立てて表示する。
// 聞けなかったときは定型文を出すので、通知が出ないことはない。
//
// ⚠ ここは通知の文面のためだけに使う。回覧の本文は返さない
//   (通知はロック画面に出るので、見出しと名前までにとどめる)。
meApp.get("/me/notice-text", async (c) => {
  const u = requireUser(c);
  const name = (u.name || "").trim();
  const { count, newestTitle } = await myUnreadCirculars(c.env.DB, u);

  if (!newestTitle) {
    return c.json({
      title: c.env.APP_NAME,
      body: "新しいお知らせがあります。開いてご確認ください。",
      count,
    });
  }
  // オーナー指定の言い方: 「(お名前)さん(回覧の見出し)の回覧通知があります。」
  const body = name
    ? `${name}さん、「${newestTitle}」の回覧通知があります。`
    : `「${newestTitle}」の回覧通知があります。`;
  // count は通知を受け取ったときにアイコンのバッジも更新するために返す
  return c.json({ title: c.env.APP_NAME, body, count });
});

// 自分の情報の更新(承認待ち中も本名への修正を許可)
// 自分の情報を自分で直す(オーナー指示 2026-07-30)。
// 役員が代わりに入力すると「名が抜けている」「メールが無い」といった不足が起きるため、
// 本人が直せるようにし、不足があることを本人にも管理者にも見せる。
meApp.post("/me", async (c) => {
  const u = requireUser(c);
  const body = await c.req
    .json<{
      name?: string;
      kana?: string;
      lang?: string;
      address?: string;
      household_head?: string;
      email?: string | null;
      phone?: string;
    }>()
    .catch(() => ({}) as Record<string, never>);

  const name = body.name?.trim();
  if (name === "") throw new HttpError(400, "お名前は空にできません");
  // 姓だけの登録を防ぐ(役員の代理入力で「名」が抜けがちなので、直すときは姓名そろえてもらう)
  if (name && !/\s/.test(name)) {
    throw new HttpError(400, "姓と名の間に空白を入れて、両方ご記入ください(例: 山田 太郎)");
  }

  // メールは重複できない。空文字が来たら「登録を外す」意味にする。
  let email: string | null | undefined;
  if (body.email !== undefined) {
    const e = (body.email || "").trim().toLowerCase();
    if (e === "") {
      email = null;
    } else {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
        throw new HttpError(400, "メールアドレスの形式を確認してください");
      }
      const taken = await c.env.DB.prepare("SELECT 1 AS x FROM persons WHERE email=? AND id<>?")
        .bind(e, u.id)
        .first();
      if (taken) throw new HttpError(400, "このメールアドレスは他の方が使用しています");
      email = e;
    }
  }

  // 電話番号はログイン情報なので、変更は受け付けるが重複は不可
  let phone: string | undefined;
  if (body.phone !== undefined && body.phone.trim() !== "") {
    phone = validatePhone(body.phone);
    const taken = await c.env.DB.prepare("SELECT 1 AS x FROM persons WHERE phone=? AND id<>?")
      .bind(phone, u.id)
      .first();
    if (taken) {
      throw new HttpError(400, "この電話番号は他の方が使用しています。町会役員へご連絡ください。");
    }
  }

  await c.env.DB.prepare(
    `UPDATE persons SET
       name = COALESCE(?, name),
       kana = COALESCE(?, kana),
       lang = COALESCE(?, lang),
       address = COALESCE(?, address),
       household_head = COALESCE(?, household_head),
       email = CASE WHEN ?=1 THEN ? ELSE email END,
       phone = COALESCE(?, phone)
     WHERE id=?`,
  )
    .bind(
      name ?? null,
      body.kana?.trim() ?? null,
      body.lang ?? null,
      body.address?.trim() ?? null,
      body.household_head?.trim() ?? null,
      email !== undefined ? 1 : 0,
      email ?? null,
      phone ?? null,
      u.id,
    )
    .run();
  await audit(c.env.DB, u.id, "person.update_self", "person", u.id);
  return c.json({ ok: true });
});

// 自分のGoogleアカウントを紐付ける(次回からGoogleでログインできる)。
// 他人のメールを勝手に登録できないよう、必ずIDトークンを検証してから保存する。
meApp.post("/me/link-google", async (c) => {
  const u = requireActive(c);
  const b = await c.req.json<{ credential?: string }>().catch(() => ({}) as { credential?: string });
  if (!b.credential) throw new HttpError(400, "ログイン情報がありません");
  const identity = await verifyGoogleIdToken(c.env, b.credential);
  if (!identity) throw new HttpError(401, "Googleアカウントを確認できませんでした");
  const taken = await c.env.DB.prepare("SELECT id FROM persons WHERE email=? AND id<>?")
    .bind(identity.email, u.id)
    .first();
  if (taken) throw new HttpError(400, "このメールアドレスは他の方が使用しています");
  await c.env.DB.prepare("UPDATE persons SET email=? WHERE id=?").bind(identity.email, u.id).run();
  await audit(c.env.DB, u.id, "auth.link_google", "person", u.id);
  return c.json({ ok: true, email: identity.email });
});

// ログイン手段を外す前の共通チェック。全部外すと本人が二度と入れなくなるため、
// 電話番号・Gmail・LINEのうち最低1つは必ず残す。
function assertKeepsOneCredential(u: Person, removing: "email" | "line") {
  const left = [
    u.phone ? "phone" : null,
    removing === "email" ? null : u.email ? "email" : null,
    removing === "line" ? null : u.line_user_id ? "line" : null,
  ].filter(Boolean);
  if (left.length === 0) {
    throw new HttpError(
      400,
      "これを外すとログインできなくなります。先に電話番号などを登録してください。",
    );
  }
}

meApp.post("/me/unlink-google", async (c) => {
  const u = requireActive(c);
  assertKeepsOneCredential(u, "email");
  await c.env.DB.prepare("UPDATE persons SET email=NULL WHERE id=?").bind(u.id).run();
  await audit(c.env.DB, u.id, "auth.unlink_google", "person", u.id);
  return c.json({ ok: true });
});

// 回覧のメール配信を止める/再開する(メール本文の配信停止リンクと同じ設定)
meApp.post("/me/email-delivery", async (c) => {
  const u = requireActive(c);
  const b = await c.req.json<{ on?: boolean }>().catch(() => ({}) as { on?: boolean });
  const optout = b.on === false ? 1 : 0;
  await c.env.DB.prepare("UPDATE persons SET email_optout=? WHERE id=?").bind(optout, u.id).run();
  await audit(c.env.DB, u.id, "auth.email_delivery", "person", u.id, { on: !optout });
  return c.json({ ok: true });
});

meApp.post("/me/unlink-line", async (c) => {
  const u = requireActive(c);
  assertKeepsOneCredential(u, "line");
  await c.env.DB.prepare("UPDATE persons SET line_user_id=NULL WHERE id=?").bind(u.id).run();
  await audit(c.env.DB, u.id, "auth.unlink_line", "person", u.id);
  return c.json({ ok: true });
});

// 会員レベル(役割)の変更依頼を出す。管理者が管理画面で確認して対応する。
meApp.post("/me/role-request", async (c) => {
  const u = requireActive(c);
  const b = await c.req.json<{ message?: string }>().catch(() => ({}) as { message?: string });
  const message = b.message?.trim();
  if (!message) throw new HttpError(400, "ご希望の内容を入力してください");
  if (message.length > 1000) throw new HttpError(400, "内容が長すぎます");
  const dup = await c.env.DB.prepare(
    "SELECT 1 AS x FROM role_requests WHERE person_id=? AND status='new' LIMIT 1",
  )
    .bind(u.id)
    .first();
  if (dup) throw new HttpError(400, "すでに依頼を受け付けています。役員からの連絡をお待ちください。");
  await c.env.DB.prepare("INSERT INTO role_requests (person_id, message) VALUES (?, ?)")
    .bind(u.id, message)
    .run();
  await audit(c.env.DB, u.id, "role_request.create", "person", u.id);
  return c.json({ ok: true });
});

// 自分の依頼の状況(依頼中かどうかだけ返す)
meApp.get("/me/role-request", async (c) => {
  const u = requireActive(c);
  const row = await c.env.DB.prepare(
    "SELECT id, status, created_at FROM role_requests WHERE person_id=? ORDER BY id DESC LIMIT 1",
  )
    .bind(u.id)
    .first();
  return c.json({ request: row ?? null });
});
