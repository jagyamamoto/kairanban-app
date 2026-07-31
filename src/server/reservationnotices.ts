// 会館予約の自動お知らせ(オーナー指示 2026-07-30)。
//
//   1. unconfirmed_2d … 利用2日前になっても確定していない
//                       → 申込者へ「まだ確定していません」/ 会館係へ「確定をお願いします」
//   2. day_before     … 前日「キャンセルは不要ですか?」
//   3. start          … 利用開始時刻になった
//   4. end_10min      … 終了10分前
//   5. end            … 利用終了(片付け・戸締まりのお願い)
//
// 同じ予約・同じ種類は二度送らない(reservation_notices が台帳)。
// 判定は日本時間。Cronは5分ごとに回すので「10分前」は最大5分の誤差で届く。
import { type Env, audit } from "./core";
import { sendMail, esc, mailEnabled } from "./email";
import { notifyPerson } from "./webpush";

export type NoticeKind = "unconfirmed_2d" | "day_before" | "start" | "end_10min" | "end";

type ResRow = {
  id: number;
  case_no: string;
  org_name: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  applicant_id: number;
  contact_name: string | null;
  contact_email: string | null;
  line_user_id: string | null;
  person_email: string | null;
  email_optout: number | null;
  is_digital: number | null;
};

/** 日本時間の「いま」を {date:'YYYY-MM-DD', minutes: 0時からの分} で返す */
function jstNow(): { date: string; minutes: number } {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return {
    date: d.toISOString().slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function addDays(date: string, days: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

const ACTIVE = "('received','checking','approved')";

async function already(env: Env, id: number, kind: NoticeKind): Promise<boolean> {
  const r = await env.DB.prepare(
    "SELECT 1 AS x FROM reservation_notices WHERE reservation_id=? AND kind=?",
  )
    .bind(id, kind)
    .first();
  return !!r;
}

async function mark(env: Env, id: number, kind: NoticeKind): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO reservation_notices (reservation_id, kind) VALUES (?,?)",
  )
    .bind(id, kind)
    .run();
}

/**
 * 申込者へ届ける。アプリの通知(Web Push→LINE)と、
 * メールアドレスが分かっている場合はメールの両方を使う。
 * 公開フォームからの予約者はアプリを入れていないことが多いので、メールが主役になる。
 */
async function notifyApplicant(env: Env, r: ResRow, subject: string, body: string): Promise<void> {
  if (r.is_digital) {
    await notifyPerson(
      env,
      env.DB,
      { id: r.applicant_id, line_user_id: r.line_user_id },
      `【${env.APP_NAME}】${subject}\n${body}`,
      "reservation_notice",
    );
  }
  // 予約に書かれた連絡先を優先(家族で同じアドレスを使う場合などに person.email が入らないため)
  const to = r.contact_email || (r.email_optout ? null : r.person_email);
  if (to && mailEnabled(env)) {
    const html =
      `<div style="font-family:'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;font-size:16px;line-height:1.8;color:#222">` +
      `<p>${esc(r.contact_name || "")} 様</p>` +
      `<p><b>${esc(subject)}</b></p>` +
      `<p>${esc(body).replace(/\n/g, "<br>")}</p>` +
      `<hr><p style="font-size:13px;color:#666">受付番号 ${esc(r.case_no)}／` +
      `${esc(r.date)} ${esc(r.start_time)}〜${esc(r.end_time)}／${esc(r.org_name)}</p></div>`;
    await sendMail(
      env,
      to,
      `【${env.APP_NAME}】${subject}`,
      html,
      `${r.contact_name || ""} 様\n\n${subject}\n\n${body}\n\n受付番号 ${r.case_no}\n${r.date} ${r.start_time}〜${r.end_time}／${r.org_name}\n`,
    );
  }
}

async function notifyHallStaff(env: Env, text: string): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT p.id, p.line_user_id FROM persons p
     JOIN role_assignments ra ON ra.person_id=p.id
     WHERE p.status='active' AND ra.role IN ('hall_manager','admin')
       AND ra.start_date<=date('now') AND (ra.end_date IS NULL OR ra.end_date>=date('now'))`,
  ).all<{ id: number; line_user_id: string | null }>();
  for (const s of rows.results) {
    await notifyPerson(env, env.DB, s, text, "reservation_notice");
  }
}

const SELECT_RES = `
  SELECT r.id, r.case_no, r.org_name, r.date, r.start_time, r.end_time, r.status,
         r.applicant_id, r.contact_name, r.contact_email,
         p.line_user_id, p.email AS person_email, p.email_optout, p.is_digital
  FROM reservations r LEFT JOIN persons p ON p.id=r.applicant_id`;

/** Cronから毎回呼ぶ。送るべきものだけ送って件数を返す。 */
export async function runReservationNotices(env: Env): Promise<Record<NoticeKind, number>> {
  const now = jstNow();
  const sent: Record<NoticeKind, number> = {
    unconfirmed_2d: 0,
    day_before: 0,
    start: 0,
    end_10min: 0,
    end: 0,
  };

  // 1) 2日後の利用で、まだ確定(approved)していないもの
  const unconfirmed = await env.DB.prepare(
    `${SELECT_RES} WHERE r.date=? AND r.status IN ('received','checking')`,
  )
    .bind(addDays(now.date, 2))
    .all<ResRow>();
  for (const r of unconfirmed.results) {
    if (await already(env, r.id, "unconfirmed_2d")) continue;
    await notifyApplicant(
      env,
      r,
      "会館のご予約がまだ確定していません",
      `${r.date} ${r.start_time}〜${r.end_time} のお申し込みは、まだ会館係の確認が済んでいません。\n` +
        `お急ぎの場合は町会役員までお声がけください。`,
    );
    await notifyHallStaff(
      env,
      `【${env.APP_NAME}】会館予約の確定をお願いします\n` +
        `${r.case_no} ${r.date} ${r.start_time}〜${r.end_time} ${r.org_name}\n` +
        `利用まであと2日ですが、まだ確定していません。`,
    );
    await mark(env, r.id, "unconfirmed_2d");
    sent.unconfirmed_2d++;
  }

  // 2) 前日の確認(キャンセルは不要か)
  const tomorrow = await env.DB.prepare(`${SELECT_RES} WHERE r.date=? AND r.status IN ${ACTIVE}`)
    .bind(addDays(now.date, 1))
    .all<ResRow>();
  for (const r of tomorrow.results) {
    if (await already(env, r.id, "day_before")) continue;
    await notifyApplicant(
      env,
      r,
      "明日、会館のご利用予定です",
      `明日 ${r.date} ${r.start_time}〜${r.end_time} に会館をご利用の予定です。\n` +
        `ご予定に変更はありませんか? 中止される場合は、お早めに取り消しをお願いします。`,
    );
    await mark(env, r.id, "day_before");
    sent.day_before++;
  }

  // 3〜5) 当日の時刻に合わせたお知らせ
  const today = await env.DB.prepare(`${SELECT_RES} WHERE r.date=? AND r.status IN ${ACTIVE}`)
    .bind(now.date)
    .all<ResRow>();
  for (const r of today.results) {
    const start = toMinutes(r.start_time);
    const end = toMinutes(r.end_time);

    // 開始時刻を過ぎた(遅れて送っても意味があるので上限は設けない)
    if (now.minutes >= start && !(await already(env, r.id, "start"))) {
      await notifyApplicant(
        env,
        r,
        "会館のご利用時間になりました",
        `${r.start_time}〜${r.end_time} でご利用の時間です。\n` +
          `鍵の開け閉め・火の元・戸締まりにご注意ください。`,
      );
      await mark(env, r.id, "start");
      sent.start++;
    }

    // 終了10分前(終了時刻を過ぎたあとに送っても意味がないので、終了前だけ)
    if (
      now.minutes >= end - 10 &&
      now.minutes < end &&
      !(await already(env, r.id, "end_10min"))
    ) {
      await notifyApplicant(
        env,
        r,
        "まもなく会館のご利用終了時間です(あと10分)",
        `${r.end_time} でご利用終了の予定です。\n片付けと戸締まりの準備をお願いします。`,
      );
      await mark(env, r.id, "end_10min");
      sent.end_10min++;
    }

    // 終了時刻を過ぎた
    if (now.minutes >= end && !(await already(env, r.id, "end"))) {
      await notifyApplicant(
        env,
        r,
        "会館のご利用終了時間です",
        `${r.end_time} でご利用終了の予定です。\n` +
          `お片付け・消灯・戸締まり・鍵のご返却をお願いします。ありがとうございました。`,
      );
      await mark(env, r.id, "end");
      sent.end++;
    }
  }

  const total = Object.values(sent).reduce((a, b) => a + b, 0);
  if (total > 0) await audit(env.DB, null, "cron.reservation_notices", undefined, undefined, sent);
  return sent;
}
