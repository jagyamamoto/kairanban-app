// 「触って試せるデモ」のための、毎晩のデータ入れ替え。
//
// ⚠⚠ 危険な処理です。**データを全部消して作り直します。** ⚠⚠
//
// 本物の町会で誤って動かないよう、次の2つが**すべて**そろったときだけ動きます:
//   1. 環境変数 DEMO_MODE が "1"
//   2. データベースの名前(DEMO_DB_NAME)に "demo" が含まれている
//
// 本物の町会で運用する場合、DEMO_MODE は**設定しないでください**(既定は無効)。
// wrangler.jsonc にも DEMO_MODE は書かないでください。
//
// 呼び出しのきっかけは `GET /api/me`(誰かが画面を開くたび)。専用のCronは
// 使っていない(Cloudflareアカウントによってはスケジュール登録が失敗することがあり、
// アクセス起点にしておけばその環境差に影響されないため)。
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
 * デモのデータを作り直す。画面を開いたときに毎回呼ばれ、
 * 「前回の入れ替えから24時間たっていたら」だけ実際に動く。
 * ⚠ isDemo() が false のときは何もしない(本物の町会を守るため)。
 *
 * ⚠⚠ 排他制御について ⚠⚠
 * このアプリは同時に何人もアクセスします。「24時間たったか」を確認してから
 * 削除を始める、という素朴な作りだと、複数のリクエストが**ほぼ同時に**
 * 「たった」と判定し、全消し処理が二重に走ってしまいます
 * (実際にこの不具合が公開直後に発生し、一時的に管理者の権限が消えました)。
 *
 * そこで `demo_reset_lock` という1行だけのテーブルに対して
 *   UPDATE ... WHERE last_reset <= 24時間前
 * を実行し、**このUPDATEで実際に1行変更できたリクエストだけ**が
 * 削除・再投入を行います。SQLiteの単一ライター特性により、
 * この UPDATE 自体は同時に来ても1つしか成功しません(D1のロック機構と同じ仕組み)。
 */
export async function resetDemoData(env: Env): Promise<boolean> {
  if (!isDemo(env)) return false;

  const claim = await env.DB.prepare(
    `UPDATE demo_reset_lock SET last_reset = datetime('now')
     WHERE id = 1 AND last_reset <= datetime('now','-${RESET_INTERVAL_HOURS} hours')`,
  ).run();
  // このリクエストが鍵を取れなかった(他のリクエストが処理中、またはまだ24時間たっていない)
  if ((claim.meta?.changes ?? 0) === 0) return false;

  // ⚠ 削除と再投入をひとつのバッチにする。D1の batch() は全体が1つの
  //   トランザクションとして実行されるため、「消したのにまだ入れていない」
  //   という中途半端な状態が他のリクエストから見えることはない。
  const statements = [
    ...TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    ...DEMO_SEED_SQL.map((sql) => env.DB.prepare(sql)),
  ];
  await env.DB.batch(statements);
  await audit(env.DB, null, "demo.reset", undefined, undefined, { interval_hours: RESET_INTERVAL_HOURS });
  return true;
}
