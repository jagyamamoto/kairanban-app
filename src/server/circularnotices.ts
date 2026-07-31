// 回覧の「実施日」に合わせたお知らせ(オーナー指示 2026-07-30)。
//
//   event_7d  … 実施日の7日前
//   event_1d  … 実施日の前日
//   event_day … 実施日の当日
//
// 実施日が入っていない回覧(お知らせだけのもの)には何も送らない。
// 同じ回覧・同じ種類は二度送らない(circular_notices が台帳)。
//
// ⚠ 判定は**日本時間**で行う。SQLiteの date('now') はUTCなので使わない。
// ⚠ 深夜に通知が飛ぶと迷惑なので、**朝8時(JST)以降**にだけ送る。
import { type Env, audit, targetsForAudience } from "./core";
import { esc, mailEnabled, sendMail } from "./email";
import { notifyPerson } from "./webpush";

export type CircularNoticeKind = "event_7d" | "event_1d" | "event_day";

const SEND_AFTER_HOUR_JST = 8;

type Row = {
  id: number;
  case_no: string;
  title: string;
  body: string;
  audience: string;
  event_date: string;
  visibility: string;
};

/** 日本時間の今日と時刻 */
function jstNow(): { date: string; hour: number } {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

function addDays(date: string, days: number): string {
  const [y, m, dd] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd, 12));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** 「2026-08-05」→「8月5日(水)」 */
function fmtJa(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
  return `${m}月${d}日(${wd})`;
}

const HEADLINE: Record<CircularNoticeKind, (d: string) => string> = {
  event_7d: (d) => `1週間後(${fmtJa(d)})の行事のお知らせ`,
  event_1d: (d) => `明日(${fmtJa(d)})の行事のお知らせ`,
  event_day: (d) => `本日(${fmtJa(d)})の行事のお知らせ`,
};

async function already(env: Env, id: number, kind: CircularNoticeKind): Promise<boolean> {
  const r = await env.DB.prepare(
    "SELECT 1 AS x FROM circular_notices WHERE circular_id=? AND kind=?",
  )
    .bind(id, kind)
    .first();
  return !!r;
}

async function send(env: Env, cir: Row, kind: CircularNoticeKind): Promise<number> {
  const head = HEADLINE[kind](cir.event_date);
  const targets = await targetsForAudience(env.DB, cir.audience);
  const text =
    `【${env.APP_NAME}】${head}\n` +
    `「${cir.title}」\n` +
    `実施日: ${fmtJa(cir.event_date)}\n` +
    `アプリの回覧からくわしい内容をご覧ください。`;

  let n = 0;
  for (const t of targets) {
    if (t.is_digital) {
      await notifyPerson(env, env.DB, t, text, "circular_event");
      n++;
    }
  }

  // メールも同じ範囲へ。回覧の本文も入れて、開かなくても分かるようにする。
  if (mailEnabled(env)) {
    const html =
      `<div style="font-family:'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;font-size:16px;line-height:1.8;color:#222">` +
      `<p style="font-weight:bold;font-size:18px;">${esc(head)}</p>` +
      `<p style="font-weight:bold;">${esc(cir.title)}</p>` +
      `<p style="color:#c62828;font-weight:bold;">実施日: ${esc(fmtJa(cir.event_date))}</p>` +
      `<div>${esc(cir.body).replace(/\r?\n/g, "<br>")}</div>` +
      `<hr><p style="font-size:12px;color:#888">受付番号 ${esc(cir.case_no)}</p></div>`;
    const plain = `${head}\n\n${cir.title}\n実施日: ${fmtJa(cir.event_date)}\n\n${cir.body}\n`;
    for (const t of targets) {
      if (!t.email || t.email_optout) continue;
      await sendMail(env, t.email, `【${env.APP_NAME}】${head}`, html, plain);
    }
  }
  return n;
}

/** Cronから毎回呼ぶ。送るべきものだけ送って件数を返す。 */
export async function runCircularEventNotices(
  env: Env,
): Promise<Record<CircularNoticeKind, number>> {
  const sent: Record<CircularNoticeKind, number> = { event_7d: 0, event_1d: 0, event_day: 0 };
  const now = jstNow();
  // 深夜に鳴らさない
  if (now.hour < SEND_AFTER_HOUR_JST) return sent;

  const plan: { kind: CircularNoticeKind; date: string }[] = [
    { kind: "event_7d", date: addDays(now.date, 7) },
    { kind: "event_1d", date: addDays(now.date, 1) },
    { kind: "event_day", date: now.date },
  ];

  for (const p of plan) {
    // 公開中で、会員向け(members/both)の回覧だけ。public限定は会員への通知対象外。
    const rows = await env.DB.prepare(
      `SELECT id, case_no, title, body, audience, event_date, visibility FROM circulars
       WHERE status='published' AND event_date = ? AND visibility IN ('members','both')`,
    )
      .bind(p.date)
      .all<Row>();
    for (const cir of rows.results) {
      if (await already(env, cir.id, p.kind)) continue;
      await send(env, cir, p.kind);
      await env.DB.prepare(
        "INSERT OR IGNORE INTO circular_notices (circular_id, kind) VALUES (?,?)",
      )
        .bind(cir.id, p.kind)
        .run();
      sent[p.kind]++;
    }
  }

  const total = Object.values(sent).reduce((a, b) => a + b, 0);
  if (total > 0) await audit(env.DB, null, "cron.circular_event_notices", undefined, undefined, sent);
  return sent;
}
