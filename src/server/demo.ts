// 「触って試せるデモ」のための、毎晩のデータ入れ替え。
//
// ⚠⚠ 危険な処理です。**データを全部消して作り直します。** ⚠⚠
//
// 本物の町会で誤って動かないよう、次の3つが**すべて**そろったときだけ動きます:
//   1. 環境変数 DEMO_MODE が "1"
//   2. データベースの名前(DEMO_DB_NAME)に "demo" が含まれている
//   3. HTTPからは呼べない(Cronのスケジュール実行からしか呼ばれない)
//
// 本物の町会で運用する場合、DEMO_MODE は**設定しないでください**(既定は無効)。
// wrangler.jsonc にも DEMO_MODE は書かないでください。
import { type Env, audit } from "./core";
import { DEMO_SEED_SQL } from "./demoseed";

/** この時間ごとに入れ替える */
const RESET_INTERVAL_HOURS = 24;

function isDemo(env: Env): boolean {
  if (env.DEMO_MODE !== "1") return false;
  // 名前に demo が入っていないデータベースでは、絶対に動かさない
  const name = (env.DEMO_DB_NAME || "").toLowerCase();
  return name.includes("demo");
}

/** 消してよいテーブル(会員・回覧など、デモで作られるもの全部) */
const TABLES = [
  "notification_log",
  "circular_confirmations",
  "circular_notices",
  "reservation_notices",
  "reservation_waitlist",
  "reservations",
  "meeting_responses",
  "meetings",
  "document_shares",
  "documents",
  "post_photos",
  "posts",
  "join_applications",
  "role_requests",
  "role_assignments",
  "push_subscriptions",
  "sponsors",
  "pages",
  "circulars",
  "persons",
  "audit_log",
  "area_alerts",
  "login_failures",
];

/**
 * デモのデータを作り直す。Cronから1日1回だけ呼ばれる。
 * ⚠ isDemo() が false のときは何もしない(本物の町会を守るため)。
 */
export async function resetDemoData(env: Env): Promise<boolean> {
  if (!isDemo(env)) return false;

  // 前回の入れ替えから24時間たっていなければ何もしない。
  // ⚠ Cronが使えない環境でも動くよう、画面を開いたときにも呼ばれる。
  //   そのため「時刻」ではなく「前回からの経過」で判定する。
  const recent = await env.DB.prepare(
    `SELECT 1 AS x FROM audit_log WHERE action='demo.reset' AND at >= datetime('now','-${RESET_INTERVAL_HOURS} hours') LIMIT 1`,
  ).first();
  if (recent) return false;

  for (const t of TABLES) {
    await env.DB.prepare(`DELETE FROM ${t}`).run().catch(() => {});
  }
  await seedDemoData(env);
  await audit(env.DB, null, "demo.reset", undefined, undefined, { interval_hours: RESET_INTERVAL_HOURS });
  return true;
}

/** 架空の町会のデータを入れる。中身は src/server/demoseed.ts */
export async function seedDemoData(env: Env): Promise<void> {
  for (const sql of DEMO_SEED_SQL) {
    await env.DB.prepare(sql).run();
  }
}
