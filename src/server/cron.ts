// 定期実行(Cron Triggers・無料): 期限が近い回覧・会合の未対応者へ自動リマインド、掲載終了日を過ぎた回覧の自動記録化
import { type Env, type Person, audit, activeRoles, targetsForAudience } from "./core";
import { MISSING_LABELS, missingFields } from "../shared/profile";
import { notifyPerson } from "./webpush";

type Circular = {
  id: number;
  title: string;
  audience: string;
  deadline: string | null;
};
type Meeting = {
  id: number;
  title: string;
  date: string;
  audience: string;
  deadline: string | null;
};

async function remindCirculars(env: Env): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT id, title, audience, deadline FROM circulars
     WHERE status='published' AND deadline IS NOT NULL
       AND deadline >= date('now') AND deadline <= date('now','+2 days')`,
  ).all<Circular>();
  let sent = 0;
  for (const cir of rows.results) {
    const targets = await targetsForAudience(env.DB, cir.audience);
    const confirmed = await env.DB.prepare(
      "SELECT person_id FROM circular_confirmations WHERE circular_id=? AND confirmed_at IS NOT NULL",
    )
      .bind(cir.id)
      .all<{ person_id: number }>();
    const confirmedIds = new Set(confirmed.results.map((r) => r.person_id));
    const text =
      `【${env.APP_NAME}】回覧のご確認をお願いします\n` +
      `「${cir.title}」\n確認期限: ${cir.deadline}\n` +
      `アプリを開いて「確認しました」を押してください。`;
    for (const t of targets) {
      if (confirmedIds.has(t.id) || !t.is_digital) continue;
      const st = await notifyPerson(env, env.DB, t, text, "circular_remind_auto");
      if (st.startsWith("sent")) sent++;
    }
  }
  return sent;
}

async function remindMeetings(env: Env): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT id, title, date, audience, deadline FROM meetings
     WHERE status='open' AND deadline IS NOT NULL
       AND deadline >= date('now') AND deadline <= date('now','+2 days')`,
  ).all<Meeting>();
  let sent = 0;
  for (const m of rows.results) {
    const targets = await targetsForAudience(env.DB, m.audience);
    const answered = await env.DB.prepare(
      "SELECT person_id FROM meeting_responses WHERE meeting_id=?",
    )
      .bind(m.id)
      .all<{ person_id: number }>();
    const answeredIds = new Set(answered.results.map((r) => r.person_id));
    const text =
      `【${env.APP_NAME}】会合の出欠回答をお願いします\n` +
      `「${m.title}」${m.date}\n回答期限: ${m.deadline}\n` +
      `アプリからご回答ください。`;
    for (const t of targets) {
      if (answeredIds.has(t.id) || !t.is_digital) continue;
      const st = await notifyPerson(env, env.DB, t, text, "meeting_remind_auto");
      if (st.startsWith("sent")) sent++;
    }
  }
  return sent;
}

// 公開中の回覧のうち、掲載終了日を過ぎたもの・掲載終了日が未設定で公開から1週間経ったものを
// 自動的に記録(archived)へ移す(オーナー指示: 終了日を決め忘れても放置されないように)。
/**
 * 掲載終了日を過ぎた回覧を自動で「記録」に移す。
 *
 * ⚠ **掲載終了日は「その日の23:59まで掲載」**(オーナー指示 2026-07-30)。
 *   例) 終了日 7/29 → 7/29 23:59 まで見える。7/30 になったら記録へ移す。
 *   そのため比較は `<`(以下ではなく未満)。`<=` にすると終了日当日に消えてしまう。
 *
 * ⚠ SQLiteの `date('now')` は**UTC**。日本時間より9時間遅れるため、
 *   そのまま使うと日本の深夜0時〜朝9時のあいだ判定がずれる。
 *   `date('now','+9 hours')` で日本時間の「今日」にしてから比べる。
 */
async function archiveExpiredCirculars(env: Env): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT id FROM circulars
     WHERE status='published'
       AND (
         (publish_end_date IS NOT NULL AND publish_end_date < date('now','+9 hours'))
         OR (publish_end_date IS NULL AND published_at <= datetime('now','-7 days'))
       )`,
  ).all<{ id: number }>();
  for (const r of rows.results) {
    await env.DB.prepare(
      "UPDATE circulars SET status='archived', updated_at=datetime('now') WHERE id=?",
    )
      .bind(r.id)
      .run();
    await audit(env.DB, null, "circular.archive_auto", "circular", r.id);
  }
  return rows.results.length;
}

// 会員情報に不足がある方へ、月に1度だけお知らせする(オーナー指示)。
// 毎日送ると煩わしいので、直近25日以内に送っていたら何もしない。
async function remindIncompleteProfiles(env: Env): Promise<number> {
  const recent = await env.DB.prepare(
    "SELECT 1 AS x FROM audit_log WHERE action='cron.profile_reminder' AND at >= datetime('now','-25 days') LIMIT 1",
  ).first();
  if (recent) return 0;

  const rows = await env.DB.prepare("SELECT * FROM persons WHERE status='active'").all<Person>();
  let sent = 0;
  for (const p of rows.results) {
    if (!p.is_digital) continue; // 紙で対応している方には送らない
    const roles = await activeRoles(env.DB, p.id);
    const missing = missingFields({ ...p, roles });
    if (!missing.length) continue;
    const text =
      `【${env.APP_NAME}】会員情報のご確認をお願いします\n` +
      `次の項目が未記入です: ${missing.map((m) => MISSING_LABELS[m]).join("・")}\n` +
      `アプリのホーム画面「あなたの登録内容」からご自分で直せます。`;
    const st = await notifyPerson(env, env.DB, p, text, "profile_incomplete");
    if (st !== "skipped") sent++;
  }
  await audit(env.DB, null, "cron.profile_reminder", undefined, undefined, { sent });
  return sent;
}

// 1日1回のみ実行(Cronが万一二重発火しても直近20時間以内なら再実行しない)
export async function runDailyReminders(env: Env): Promise<void> {
  const recent = await env.DB.prepare(
    "SELECT 1 AS x FROM audit_log WHERE action='cron.daily_reminder' AND at >= datetime('now','-20 hours') LIMIT 1",
  ).first();
  if (recent) return;
  await audit(env.DB, null, "cron.daily_reminder", undefined, undefined, { started: true });
  const circularsSent = await remindCirculars(env);
  const meetingsSent = await remindMeetings(env);
  const archived = await archiveExpiredCirculars(env);
  const profileSent = await remindIncompleteProfiles(env);
  await audit(env.DB, null, "cron.daily_reminder", undefined, undefined, {
    circulars_sent: circularsSent,
    meetings_sent: meetingsSent,
    circulars_archived: archived,
    profile_reminders: profileSent,
  });
}
