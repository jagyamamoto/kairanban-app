// サーバー共通: 環境型、セッション、権限、監査、案件番号、LINE通知(予算管理)
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { isHallUserOnly as isOnlyHallUser } from "../shared/roles";

export type Env = {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  IMAGES: R2Bucket;
  APP_NAME: string;
  DEV_MODE: string;
  // ⚠ 「触って試せるデモ」用。**本物の町会では設定しないこと**(毎晩データを全消しします)。
  //    詳しくは src/server/demo.ts
  DEMO_MODE?: string;
  DEMO_DB_NAME?: string;
  LINE_LOGIN_CHANNEL_ID?: string;
  LIFF_ID: string;
  SESSION_SECRET?: string;
  SETUP_CODE?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  GOOGLE_CLIENT_ID?: string;
  LINE_LOGIN_CHANNEL_SECRET?: string;
  // LINE Developers で「メールアドレス取得権限」の申請が通ったら "1" にする。
  // 未申請のまま email スコープを要求すると認可画面がエラーになるため既定はオフ。
  LINE_EMAIL_SCOPE?: string;
  // 回覧のメール配信(Resend)。未設定ならメールは送らない。
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_REPLY_TO?: string;
  APP_URL?: string;
};

export type Person = {
  id: number;
  name: string;
  kana: string | null;
  line_user_id: string | null;
  contact: string | null;
  lang: string;
  is_digital: number;
  status: string;
  note: string | null;
  phone: string | null;
  hall_early_access: number;
  address: string | null;
  household_head: string | null;
  requested_roles: string | null;
  signup_note: string | null;
  email: string | null;
  email_optout: number;
  created_at: string;
  approved_at: string | null;
  approved_by: number | null;
};

export type User = Person & { roles: string[] };

export type AppEnv = { Bindings: Env; Variables: { user: User | null } };

// ============ 日本時間ヘルパー ============
export function jstDate(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000);
}
export function jstYear(): number {
  return jstDate().getUTCFullYear();
}
export function jstMonth(): string {
  const d = jstDate();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ============ セッション(HMAC署名Cookie) ============
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}
async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}
function sessionSecret(env: Env): string {
  return env.SESSION_SECRET || "dev-secret-do-not-use-in-production";
}

export async function createSessionToken(env: Env, personId: number): Promise<string> {
  const payload = b64url(
    enc.encode(JSON.stringify({ pid: personId, exp: Date.now() + 90 * 24 * 3600 * 1000 })),
  );
  const sig = await hmac(sessionSecret(env), payload);
  return `${payload}.${sig}`;
}

export async function readSessionToken(env: Env, token: string): Promise<number | null> {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = await hmac(sessionSecret(env), payload);
  if (sig !== expect) return null;
  try {
    const data = JSON.parse(b64urlDecode(payload)) as { pid: number; exp: number };
    if (typeof data.pid !== "number" || data.exp < Date.now()) return null;
    return data.pid;
  } catch {
    return null;
  }
}

// 汎用の短命な署名付きトークン。会員登録の申請中にLINEの本人情報を一時的に
// 預かる用途に使う(まだpersonsに行がないためセッションが張れない)。
export async function createSignedBlob(
  env: Env,
  data: unknown,
  ttlMs: number,
): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ d: data, exp: Date.now() + ttlMs })));
  return `${payload}.${await hmac(sessionSecret(env), payload)}`;
}

export async function readSignedBlob<T>(env: Env, token: string): Promise<T | null> {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  if (token.slice(dot + 1) !== (await hmac(sessionSecret(env), payload))) return null;
  try {
    const o = JSON.parse(b64urlDecode(payload)) as { d: T; exp: number };
    return o.exp < Date.now() ? null : o.d;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "sess";

// ============ ユーザー読み込みミドルウェア ============
export async function activeRoles(db: D1Database, personId: number): Promise<string[]> {
  const rs = await db
    .prepare(
      "SELECT DISTINCT role FROM role_assignments WHERE person_id=? AND start_date<=date('now') AND (end_date IS NULL OR end_date>=date('now'))",
    )
    .bind(personId)
    .all<{ role: string }>();
  return rs.results.map((r) => r.role);
}

export async function attachUser(c: Context<AppEnv>, next: Next) {
  c.set("user", null);
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) {
    const pid = await readSessionToken(c.env, raw);
    if (pid != null) {
      const p = await c.env.DB.prepare("SELECT * FROM persons WHERE id=?").bind(pid).first<Person>();
      if (p && p.status !== "left") {
        c.set("user", { ...p, roles: await activeRoles(c.env.DB, p.id) });
      }
    }
  }
  await next();
}

export function requireUser(c: Context<AppEnv>): User {
  const u = c.get("user");
  if (!u) throw new HttpError(401, "ログインが必要です");
  return u;
}
export function requireActive(c: Context<AppEnv>): User {
  const u = requireUser(c);
  if (u.status !== "active") throw new HttpError(403, "町内会の承認待ちです");
  return u;
}
export function requireRoles(c: Context<AppEnv>, roles: string[]): User {
  const u = requireActive(c);
  if (!u.roles.some((r) => roles.includes(r))) throw new HttpError(403, "この操作の権限がありません");
  return u;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ============ 電話番号ログイン ============
// SMS確認は行わない。電話番号そのものが認証情報(役員が事前に登録する)。
export function normalizePhone(input: string): string {
  return input.replace(/[^0-9]/g, "");
}
export function validatePhone(input: string): string {
  const n = normalizePhone(input);
  if (n.length < 9 || n.length > 11) {
    throw new HttpError(400, "電話番号を確認してください(ハイフンなしで9〜11桁)");
  }
  return n;
}

// 汎用レート制限(IPごと1時間単位)。ログイン総当たり対策・公開フォームのスパム対策で共用。
function rateHourBucket(scope: string): string {
  return `${scope}:${new Date().toISOString().slice(0, 13)}`; // 'login:2026-07-28T08'
}
export async function isRateLimited(
  db: D1Database,
  scope: string,
  ip: string,
  limit: number,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT count FROM login_attempts WHERE bucket=? AND ip=?")
    .bind(rateHourBucket(scope), ip)
    .first<{ count: number }>();
  return (row?.count ?? 0) >= limit;
}
export async function recordAttempt(db: D1Database, scope: string, ip: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO login_attempts (bucket, ip, count) VALUES (?,?,1)
       ON CONFLICT(bucket, ip) DO UPDATE SET count = count + 1`,
    )
    .bind(rateHourBucket(scope), ip)
    .run();
}
const LOGIN_RATE_LIMIT = 20;
export const loginRateLimited = (db: D1Database, ip: string) => isRateLimited(db, "login", ip, LOGIN_RATE_LIMIT);
export const recordLoginFailure = (db: D1Database, ip: string) => recordAttempt(db, "login", ip);

// ============ 権限グループ ============
// 管理閲覧権限.xlsx(オーナー提供・2026-07-29)に合わせて整理。
// 「副管理者」は新しい役割ではなく既存の senior_officer(上級役員)のことと確認済み。
export const CIRCULAR_CREATE = ["senior_officer", "pr", "circular_manager", "admin"];
export const CIRCULAR_APPROVE = ["senior_officer", "admin"];
export const CONFIRM_VIEW = ["senior_officer", "circular_manager", "pr", "admin"]; // オブザーバー不可
// 会館管理: 表により町内会役員・上級役員にも解放(従来はhall_manager/adminのみ)
export const HALL = ["hall_manager", "officer", "senior_officer", "admin"];
export const MEMBER_ADMIN = ["senior_officer", "admin"];
export const PROXY = ["senior_officer", "circular_manager", "pr", "hall_manager", "officer", "admin"];
// 会合の作成・管理(officers/kodomo/シニアクラブいずれの会合も扱うためkodomo_officer・seniors_memberも含む)
export const MEETING_MANAGE = [
  "officer",
  "senior_officer",
  "hall_manager",
  "circular_manager",
  "pr",
  "kodomo_officer",
  "seniors_member",
  "admin",
];
// 入会申込への到達可否(閲覧範囲そのものはapplicationKindsForで種類ごとに絞る)
export const APPLICATION_VIEW = ["officer", "senior_officer", "kodomo_officer", "admin"];
// 回覧管理系エンドポイントへの到達可否(対象ごとの絞り込みはcanManageCircularAudienceで行う)
export const CIRCULAR_ACCESS = ["senior_officer", "pr", "circular_manager", "officer", "kodomo_officer", "admin"];

// 入会申込のうちその役割が担当する種類('chonai'=町内会 / 'kodomo'=子ども会)。空配列=担当なし
export function applicationKindsFor(roles: string[]): string[] {
  if (roles.some((r) => ["admin", "senior_officer"].includes(r))) return ["chonai", "kodomo"];
  const kinds: string[] = [];
  if (roles.includes("officer")) kinds.push("chonai");
  if (roles.includes("kodomo_officer")) kinds.push("kodomo");
  return kinds;
}

// 回覧の作成・編集(下書きの準備)を対象(audience)ごとに誰が行えるか
export function canDraftCircularAudience(roles: string[], audience: string): boolean {
  if (roles.some((r) => ["admin", "senior_officer", "pr", "circular_manager"].includes(r))) return true;
  if (roles.includes("officer") && ["officers", "seniors"].includes(audience)) return true;
  if (roles.includes("kodomo_officer") && audience === "kodomo") return true;
  return false; // group:<id> は従来通り上位権限のみ
}

// 回覧の承認・公開・終了(通知を伴う確定操作)を対象(audience)ごとに誰が行えるか。
// pr・回覧担当は下書きまで(従来通り上級役員の承認が必要)。町内会役員・子ども会役員は
// 表(管理閲覧権限.xlsx)により自分の担当対象だけ承認まで行える。
export function canApproveCircularAudience(roles: string[], audience: string): boolean {
  if (roles.some((r) => ["admin", "senior_officer"].includes(r))) return true;
  if (roles.includes("officer") && ["officers", "seniors"].includes(audience)) return true;
  if (roles.includes("kodomo_officer") && audience === "kodomo") return true;
  return false;
}

const OFFICER_LIKE = [
  "officer",
  "senior_officer",
  "pr",
  "circular_manager",
  "hall_manager",
  "kodomo_officer",
  "admin",
];
const KODOMO = ["kodomo_parent", "kodomo_officer", "admin"];
const SENIORS_ADMIN = ["seniors_member", "admin"];
// 子ども会・シニアクラブ向け回覧を「閲覧」できる役員系ロール(通知・確認対象には含めない=canManageCircularAudienceと同じ範囲)
const CIRCULAR_MANAGERS_VIEW = ["officer", "senior_officer", "admin"];

// 「会館予約者」は町会の外の人(貸館の利用者)。会館予約以外は使えない。
// ⚠ ここを緩めると、会館を借りただけの人に町会の回覧や資料が見えてしまう。
// 判定は画面側とズレないよう shared/roles.ts に置いてある。
export { HALL_USER_ROLE, isHallUserOnly } from "../shared/roles";

export function rolesMatchAudience(roles: string[], audience: string): boolean {
  // 会館予約者だけの人は、どの回覧の対象にもしない
  if (isOnlyHallUser(roles)) return false;
  if (audience === "all") return true;
  if (audience === "officers") return roles.some((r) => OFFICER_LIKE.includes(r) || r === "observer");
  if (audience === "kodomo") return roles.some((r) => KODOMO.includes(r));
  if (audience === "seniors") return roles.some((r) => SENIORS_ADMIN.includes(r));
  return false; // group:<id> は別途DB照会
}

// 閲覧可否(rolesMatchAudienceより広い): 子ども会・シニアクラブを管理する役員は、
// 通知・確認対象ではないが一覧・詳細は読める(オブザーバーが役員向け回覧を読めるのと同じ考え方)
export function rolesCanViewAudience(roles: string[], audience: string): boolean {
  if (rolesMatchAudience(roles, audience)) return true;
  if (audience === "kodomo" || audience === "seniors") {
    return roles.some((r) => CIRCULAR_MANAGERS_VIEW.includes(r));
  }
  return false;
}

export async function audienceMatch(
  db: D1Database,
  audience: string,
  user: User,
): Promise<boolean> {
  if (audience.startsWith("group:")) {
    const gid = Number(audience.slice(6));
    if (!Number.isFinite(gid)) return false;
    const row = await db
      .prepare("SELECT 1 AS x FROM group_members WHERE group_id=? AND person_id=?")
      .bind(gid, user.id)
      .first();
    return !!row;
  }
  return rolesMatchAudience(user.roles, audience);
}

// 一覧・詳細の閲覧可否(audienceMatchより広い。「確認しました」は引き続きaudienceMatchで判定)
export async function canViewAudience(
  db: D1Database,
  audience: string,
  user: User,
): Promise<boolean> {
  if (audience.startsWith("group:")) return audienceMatch(db, audience, user);
  return rolesCanViewAudience(user.roles, audience);
}

// 回覧の確認対象者(オブザーバーは対象外)
export async function targetsForAudience(
  db: D1Database,
  audience: string,
): Promise<Person[]> {
  if (audience.startsWith("group:")) {
    const gid = Number(audience.slice(6));
    const rs = await db
      .prepare(
        "SELECT p.* FROM persons p JOIN group_members gm ON gm.person_id=p.id WHERE gm.group_id=? AND p.status='active'",
      )
      .bind(gid)
      .all<Person>();
    return rs.results;
  }
  const persons = await db
    .prepare("SELECT * FROM persons WHERE status='active'")
    .all<Person>();
  const roleRows = await db
    .prepare(
      "SELECT person_id, role FROM role_assignments WHERE start_date<=date('now') AND (end_date IS NULL OR end_date>=date('now'))",
    )
    .all<{ person_id: number; role: string }>();
  const roleMap = new Map<number, string[]>();
  for (const r of roleRows.results) {
    const list = roleMap.get(r.person_id) ?? [];
    list.push(r.role);
    roleMap.set(r.person_id, list);
  }
  return persons.results.filter((p) => {
    const roles = roleMap.get(p.id) ?? [];
    if (roles.length === 1 && roles[0] === "observer") return false; // オブザーバーのみは対象外
    if (isOnlyHallUser(roles)) return false; // 会館予約者(貸館の外部利用者)は対象外
    if (audience === "all") return true;
    return rolesMatchAudience(roles.filter((r) => r !== "observer"), audience);
  });
}

// ============ 監査ログ ============
export async function audit(
  db: D1Database,
  actorId: number | null,
  action: string,
  targetType?: string,
  targetId?: string | number,
  detail?: unknown,
) {
  await db
    .prepare(
      "INSERT INTO audit_log (actor_id, action, target_type, target_id, detail) VALUES (?,?,?,?,?)",
    )
    .bind(
      actorId,
      action,
      targetType ?? null,
      targetId != null ? String(targetId) : null,
      detail != null ? JSON.stringify(detail) : null,
    )
    .run();
}

// ============ 案件番号 ============
export async function nextCaseNo(
  db: D1Database,
  prefix: "KA" | "KY" | "KM" | "KE",
): Promise<string> {
  const key = `${prefix}-${jstYear()}`;
  const row = await db
    .prepare(
      "INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1 RETURNING value",
    )
    .bind(key)
    .first<{ value: number }>();
  return `${key}-${String(row!.value).padStart(4, "0")}`;
}

// ============ LINE通知(無料枠 月200通の予算管理) ============
const MONTHLY_BUDGET = 190; // 200通の無料枠に安全マージン

export async function pushLine(
  env: Env,
  db: D1Database,
  personId: number | null,
  lineUserId: string,
  text: string,
  kind: string,
): Promise<string> {
  const month = jstMonth();
  const log = async (status: string) => {
    await db
      .prepare("INSERT INTO notification_log (month, to_person, kind, status) VALUES (?,?,?,?)")
      .bind(month, personId, kind, status)
      .run();
    return status;
  };
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return log("skipped_config");
  const used = await db
    .prepare("SELECT COUNT(*) AS n FROM notification_log WHERE month=? AND status='sent'")
    .bind(month)
    .first<{ n: number }>();
  if ((used?.n ?? 0) >= MONTHLY_BUDGET) return log("skipped_budget");
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text }] }),
    });
    return log(res.ok ? "sent" : "failed");
  } catch {
    return log("failed");
  }
}

// 複数人へ順に送る(予算を消費しすぎないよう件数上限つき)
export async function pushLineMany(
  env: Env,
  db: D1Database,
  targets: { personId: number; lineUserId: string }[],
  text: string,
  kind: string,
  maxCount = 100,
) {
  for (const t of targets.slice(0, maxCount)) {
    await pushLine(env, db, t.personId, t.lineUserId, text, kind);
  }
}
