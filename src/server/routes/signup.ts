// 会員登録(公開・ログイン不要)。
// 役員が全員を手入力するのは現実的でないため、本人に登録してもらう。
// オーナー方針(2026-07-29)により**自動承認**: status='active' で作成しその場でログインさせ、
// 管理者は「却下(登録の取り消し)」と「権限の変更」だけを行う。
// ただし役員系の役割は自己申告では付けない(下の AUTO_GRANT_ROLES を参照)。
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  type AppEnv,
  HttpError,
  SESSION_COOKIE,
  audit,
  createSessionToken,
  isRateLimited,
  readSignedBlob,
  recordAttempt,
  validatePhone,
} from "../core";
import { SIGNUP_LINE_COOKIE } from "./auth";
import { sendWelcomeCirculars } from "../circularmail";
import { notifyPerson } from "../webpush";

// 本人が選べる所属。admin や上級役員など強い権限は自己申告させない(承認時に役員が付ける)。
export const SELECTABLE_ROLES = [
  "member",
  "kodomo_parent",
  "officer",
  "hall_manager",
  "kodomo_officer",
  "seniors_member",
];

// 申請は自動承認する(オーナー方針: 管理者は却下と権限変更だけ行う)。
// ただし**自己申告のまま自動で付けてよいのは「権限を持たない所属」だけ**。
// officer / kodomo_officer / hall_manager は他人の個人情報や役員限定の回覧・資料が
// 見えてしまうため、名乗るだけでは付けない。申告は requested_roles に残し、
// 管理画面で役員が確認して付与する。
export const AUTO_GRANT_ROLES = ["member", "kodomo_parent", "seniors_member"];

const signup = new Hono<AppEnv>();

signup.post("/", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (await isRateLimited(c.env.DB, "signup", ip, 5)) {
    throw new HttpError(429, "しばらくしてからもう一度お試しください");
  }
  type Body = {
    last_name?: string;
    first_name?: string;
    kana?: string;
    address?: string;
    household_head?: string;
    phone?: string;
    email?: string;
    roles?: string[];
    note?: string;
    hp?: string; // ハニーポット(ボット対策)
  };
  const b = await c.req.json<Body>().catch(() => ({}) as Body);
  if (b.hp) return c.json({ ok: true }); // ボットには成功したように見せる

  const last = b.last_name?.trim() || "";
  const first = b.first_name?.trim() || "";
  if (!last || !first) throw new HttpError(400, "姓と名を入力してください");
  const address = b.address?.trim() || "";
  if (!address) throw new HttpError(400, "住所(七丁目より後ろ)を入力してください");
  // 町内会は世帯単位。誰の名義で登録されているかを持っておく(オーナー指示 2026-07-30)。
  // 本人が名義人なら本人の氏名が入る。役員が名義人でないこともあるため本人とは別に持つ。
  const householdHead = b.household_head?.trim() || `${last} ${first}`;
  const phone = validatePhone(b.phone || "");

  // 重複チェック: 同じ電話番号は1人1件。既にある場合は状態に応じて案内を変える。
  const existing = await c.env.DB.prepare("SELECT id, name, status FROM persons WHERE phone=?")
    .bind(phone)
    .first<{ id: number; name: string; status: string }>();
  if (existing) {
    await recordAttempt(c.env.DB, "signup", ip);
    if (existing.status === "pending") {
      throw new HttpError(400, "この電話番号はすでに申請済みです。役員の確認をお待ちください。");
    }
    if (existing.status === "active") {
      throw new HttpError(400, "この電話番号はすでに登録されています。そのままログインできます。");
    }
    throw new HttpError(400, "この電話番号は登録できません。役員にお問い合わせください。");
  }

  // 連絡先のメール(強く推奨・必須ではない)。回覧のメール配信にも使う。
  // LINEで本人確認された場合は、LINEから受け取ったメールを既定値にする。
  const lineIdentity = await readSignedBlob<{ sub: string; name: string | null; email: string | null }>(
    c.env,
    getCookie(c, SIGNUP_LINE_COOKIE) || "",
  );
  let email = (b.email || "").trim().toLowerCase();
  if (!email && lineIdentity?.email) email = lineIdentity.email;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, "メールアドレスの形式を確認してください");
  }
  if (email) {
    const dup = await c.env.DB.prepare("SELECT 1 AS x FROM persons WHERE email=?").bind(email).first();
    if (dup) throw new HttpError(400, "このメールアドレスはすでに登録されています");
  }
  if (lineIdentity) {
    const dup = await c.env.DB.prepare("SELECT 1 AS x FROM persons WHERE line_user_id=?")
      .bind(lineIdentity.sub)
      .first();
    if (dup) throw new HttpError(400, "このLINEアカウントはすでに登録されています");
  }

  const requested = (b.roles ?? []).filter((r) => SELECTABLE_ROLES.includes(r));
  if (requested.length === 0) requested.push("member");
  // 自動で付ける所属(権限を伴わないもの)。1つも該当しなければ最低限「member」。
  const granted = requested.filter((r) => AUTO_GRANT_ROLES.includes(r));
  if (granted.length === 0) granted.push("member");
  // 役員などの申告は自動では付けず、管理画面で確認してもらう
  const needsReview = requested.filter((r) => !AUTO_GRANT_ROLES.includes(r));
  const name = `${last} ${first}`;

  await recordAttempt(c.env.DB, "signup", ip);
  // オーナー方針: 申請は自動承認(status='active')。管理者は却下と権限変更だけ行う。
  const row = await c.env.DB.prepare(
    `INSERT INTO persons (name, kana, phone, email, line_user_id, address, household_head, requested_roles, signup_note, is_digital, status)
     VALUES (?,?,?,?,?,?,?,?,?,1,'active') RETURNING *`,
  )
    .bind(
      name,
      b.kana?.trim() || null,
      phone,
      email || null,
      lineIdentity?.sub || null,
      address,
      householdHead,
      JSON.stringify(requested),
      b.note?.trim() || null,
    )
    .first<{ id: number }>();

  for (const r of granted) {
    await c.env.DB.prepare(
      "INSERT INTO role_assignments (person_id, role, granted_by) VALUES (?,?,NULL)",
    )
      .bind(row!.id, r)
      .run();
  }

  deleteCookie(c, SIGNUP_LINE_COOKIE, { path: "/" });
  await audit(c.env.DB, null, "member.signup_auto_approved", "person", row!.id, {
    name,
    granted,
    needsReview,
  });

  // 申請者本人はそのままログインできる(自動承認のため)
  setCookie(c, SESSION_COOKIE, await createSessionToken(c.env, row!.id), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 90 * 24 * 3600,
  });

  // 会員管理の担当(上級役員・管理者)へ通知
  const env = c.env;
  const reqUrl = c.req.url;
  c.executionCtx.waitUntil(
    (async () => {
      // 入会した時点で公開中の回覧を、本人へまとめて1通お送りする(オーナー指示)。
      // 例) 回覧Aが1/1公開・1/30終了。1/10に入会した人はAを受け取る。
      // PWAの未確認一覧のほうは /api/circulars が公開中を返すので自動的に出る。
      const welcome = await sendWelcomeCirculars(env, reqUrl, {
        id: row!.id,
        name,
        email: email || null,
        roles: granted,
      });
      if (welcome.sent) {
        await audit(env.DB, null, "circular.welcome_email", "person", row!.id, {
          count: welcome.count,
        });
      }

      const rows = await env.DB.prepare(
        `SELECT DISTINCT p.id, p.line_user_id FROM persons p
         JOIN role_assignments ra ON ra.person_id=p.id
         WHERE p.status='active' AND ra.role IN ('senior_officer','admin')
           AND ra.start_date<=date('now') AND (ra.end_date IS NULL OR ra.end_date>=date('now'))`,
      ).all<{ id: number; line_user_id: string | null }>();
      const text =
        `【${env.APP_NAME}】新しい会員が登録されました\n` +
        `${name} さん(${address})\n` +
        (needsReview.length
          ? `※「${needsReview.join("・")}」の申告があります。管理画面の「会員」で確認して権限を付けてください。\n`
          : "") +
        `内容が違う場合は管理画面の「会員」から直せます。`;
      for (const r of rows.results) {
        await notifyPerson(env, env.DB, r, text, "signup_request");
      }
    })(),
  );
  return c.json({ ok: true, autoApproved: true, needsReview });
});

// 申請フォームに戻ってきたとき、LINE連携が済んでいるかを返す(値は最小限)
signup.get("/line-state", async (c) => {
  const id = await readSignedBlob<{ sub: string; name: string | null; email: string | null }>(
    c.env,
    getCookie(c, SIGNUP_LINE_COOKIE) || "",
  );
  if (!id) return c.json({ linked: false });
  return c.json({ linked: true, name: id.name, email: id.email });
});

// ⚠ 電話番号の存在確認API(check-phone)は**意図的に置いていない**。
// この方式では電話番号そのものがログイン情報なので、「その番号が登録済みか」を
// 誰でも確認できると、総当たりで有効な番号を見つけてログインされてしまう。
// 重複の案内は、申請フォーム送信時(レート制限つき)にだけ返す。

export default signup;
