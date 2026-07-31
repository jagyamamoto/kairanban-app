// 会館予約: 申請・カレンダー表示・キャンセル待ち、会館係の担当引受(排他)・状態管理・代理申請
// 利用時間は8:00〜22:00(タクシー会社等 hall_early_access=1 の会員のみ6:00から)。
// 同一日時に仮予約(受付/確認中)が既にある場合は直接予約できず、キャンセル待ち(1予約につき1名まで)に登録する。
import { Hono } from "hono";
import {
  type AppEnv,
  type Person,
  HALL,
  HALL_USER_ROLE,
  HttpError,
  PROXY,
  audit,
  isRateLimited,
  nextCaseNo,
  recordAttempt,
  requireActive,
  requireRoles,
  validatePhone,
} from "../core";
import { notifyPerson } from "../webpush";
import { esc, mailEnabled, sendMail } from "../email";
import { REPEAT_MODES, type RepeatMode, repeatDates } from "../../shared/repeat";
import { runReservationNotices } from "../reservationnotices";

type Reservation = {
  id: number;
  case_no: string;
  repeat_group: string | null;
  org_name: string;
  applicant_id: number;
  date: string;
  start_time: string;
  end_time: string;
  purpose: string;
  headcount: number | null;
  note: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: string;
  status_reason: string | null;
  assignee_id: number | null;
  proxy_by: number | null;
  created_at: string;
  updated_at: string;
};

const HALL_OPEN = "08:00";
const HALL_OPEN_EARLY = "06:00";
const HALL_CLOSE = "22:00";
const ACTIVE_STATUSES = ["received", "checking", "approved"];

function validateInput(b: {
  org_name?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  purpose?: string;
  contact_name?: string;
  contact_phone?: string;
}) {
  if (!b.org_name?.trim()) throw new HttpError(400, "利用団体名を入力してください");
  // 当日の担当者と連絡先は必須(オーナー指示)
  if (!b.contact_name?.trim()) throw new HttpError(400, "担当者のお名前を入力してください");
  if (!b.contact_phone?.trim()) throw new HttpError(400, "担当者の電話番号を入力してください");
  validatePhone(b.contact_phone);
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new HttpError(400, "日付が正しくありません");
  if (!b.start_time || !/^\d{2}:\d{2}$/.test(b.start_time)) throw new HttpError(400, "開始時刻が正しくありません");
  if (!b.end_time || !/^\d{2}:\d{2}$/.test(b.end_time)) throw new HttpError(400, "終了時刻が正しくありません");
  if (b.end_time <= b.start_time) throw new HttpError(400, "終了時刻は開始時刻より後にしてください");
  if (!b.purpose?.trim()) throw new HttpError(400, "利用目的を入力してください");
}

// 利用時間帯の制限(申請者の早朝利用許可フラグに応じて開館時刻が変わる)
function validateHours(startTime: string, endTime: string, earlyAccess: boolean) {
  const open = earlyAccess ? HALL_OPEN_EARLY : HALL_OPEN;
  if (startTime < open) {
    throw new HttpError(
      400,
      earlyAccess
        ? `会館の利用は${HALL_OPEN_EARLY}以降にしてください`
        : `会館の予約は${HALL_OPEN}〜${HALL_CLOSE}です(一部会員のみ${HALL_OPEN_EARLY}から利用可)`,
    );
  }
  if (endTime > HALL_CLOSE) {
    throw new HttpError(400, `会館の利用は${HALL_CLOSE}までにしてください`);
  }
}

// 同一日で時間帯が重なる有効な予約を検索(自分自身のid除外用にexcludeIdを指定可)
async function findOverlap(
  db: D1Database,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: number,
): Promise<Reservation | null> {
  const row = await db
    .prepare(
      `SELECT * FROM reservations
       WHERE date=? AND status IN ('received','checking','approved')
         AND NOT (end_time<=? OR start_time>=?)
         AND id != ?
       LIMIT 1`,
    )
    .bind(date, startTime, endTime, excludeId ?? -1)
    .first<Reservation>();
  return row ?? null;
}

// 会館係と管理者に新規申請を通知
async function notifyHallManagers(env: AppEnv["Bindings"], caseNo: string, summary: string) {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT p.id, p.line_user_id FROM persons p
     JOIN role_assignments ra ON ra.person_id=p.id
     WHERE p.status='active'
       AND ra.role IN ('hall_manager','admin')
       AND ra.start_date<=date('now') AND (ra.end_date IS NULL OR ra.end_date>=date('now'))`,
  ).all<{ id: number; line_user_id: string | null }>();
  const text = `【会館予約】新しい申請 ${caseNo}\n${summary}\nアプリの管理画面から「担当します」を押してください。`;
  for (const r of rows.results) {
    await notifyPerson(env, env.DB, r, text, "reservation_new");
  }
}

// 予約が承認・差戻し・取消された時、キャンセル待ちの人へ知らせて登録を消す
async function resolveWaitlist(env: AppEnv["Bindings"], reservationId: number, taken: boolean) {
  const wl = await env.DB.prepare(
    `SELECT w.person_id, w.reservation_id, p.line_user_id, p.name, p.email, p.email_optout,
            r.date, r.start_time, r.end_time
     FROM reservation_waitlist w
     JOIN persons p ON p.id=w.person_id
     JOIN reservations r ON r.id=w.reservation_id
     WHERE w.reservation_id=?`,
  )
    .bind(reservationId)
    .first<{
      person_id: number;
      line_user_id: string | null;
      name: string;
      email: string | null;
      email_optout: number;
      date: string;
      start_time: string;
      end_time: string;
    }>();
  if (!wl) return;
  await env.DB.prepare("DELETE FROM reservation_waitlist WHERE reservation_id=?")
    .bind(reservationId)
    .run();
  const slot = `${wl.date} ${wl.start_time}〜${wl.end_time}`;
  const subject = taken
    ? "キャンセル待ちの枠はご利用いただけません"
    : "キャンセル待ちの枠が空きました";
  const text = taken
    ? `【会館予約】キャンセル待ちしていた枠(${slot})は、他の方の予約が確定したためご利用いただけません。`
    : `【会館予約】キャンセル待ちしていた枠(${slot})が空きました。お早めに改めてお申し込みください。`;
  await notifyPerson(env, env.DB, { id: wl.person_id, line_user_id: wl.line_user_id }, text, "reservation_waitlist");
  // 公開フォームからの予約者はアプリを入れていないことが多いので、メールでも知らせる
  if (wl.email && !wl.email_optout && mailEnabled(env)) {
    const url = (env.APP_URL || "").replace(/\/$/, "");
    const html =
      `<div style="font-family:'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;font-size:16px;line-height:1.8;color:#222">` +
      `<p>${esc(wl.name)} 様</p><p><b>${esc(subject)}</b></p>` +
      `<p>${esc(text)}</p>` +
      (taken ? "" : `<p><a href="${url}/">会館の予約ページを開く</a></p>`) +
      `</div>`;
    await sendMail(env, wl.email, `【${env.APP_NAME}】${subject}`, html, `${text}\n`);
  }
}

// ============ 会員向け ============
const reservations = new Hono<AppEnv>();

reservations.get("/mine", async (c) => {
  const u = requireActive(c);
  const rows = await c.env.DB.prepare(
    "SELECT * FROM reservations WHERE applicant_id=? ORDER BY date DESC, start_time DESC LIMIT 50",
  )
    .bind(u.id)
    .all<Reservation>();
  return c.json({ reservations: rows.results });
});

// カレンダー表示用(会員向け・最小情報)。仮予約(received/checking)かどうか、キャンセル待ちの有無を含む。
reservations.get("/calendar", async (c) => {
  const u = requireActive(c);
  const from = c.req.query("from") || new Date().toISOString().slice(0, 10);
  const to = c.req.query("to") || "9999-12-31";
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.date, r.start_time, r.end_time, r.status, r.org_name, r.applicant_id,
            w.person_id AS waitlist_person_id
     FROM reservations r
     LEFT JOIN reservation_waitlist w ON w.reservation_id=r.id
     WHERE r.date>=? AND r.date<=? AND r.status IN ('received','checking','approved')
     ORDER BY r.date, r.start_time`,
  )
    .bind(from, to)
    .all<{
      id: number;
      date: string;
      start_time: string;
      end_time: string;
      status: string;
      org_name: string;
      applicant_id: number;
      waitlist_person_id: number | null;
    }>();
  return c.json({
    slots: rows.results.map((r) => ({
      id: r.id,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      status: r.status,
      org_name: r.org_name,
      provisional: r.status !== "approved",
      is_mine: r.applicant_id === u.id,
      has_waitlist: r.waitlist_person_id != null,
      waitlist_is_mine: r.waitlist_person_id === u.id,
    })),
  });
});

reservations.post("/", async (c) => {
  const u = requireActive(c);
  const b = await c.req.json<{
    org_name?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
    purpose?: string;
    headcount?: number;
    note?: string;
    contact_name?: string;
    contact_phone?: string;
  }>();
  validateInput(b);
  validateHours(b.start_time!, b.end_time!, !!u.hall_early_access);
  const overlap = await findOverlap(c.env.DB, b.date!, b.start_time!, b.end_time!);
  if (overlap) {
    throw new HttpError(
      409,
      overlap.status === "approved"
        ? "この時間帯はすでに予約が確定しています"
        : "この時間帯は仮予約が入っています。キャンセル待ちに登録できます。",
    );
  }
  const caseNo = await nextCaseNo(c.env.DB, "KY");
  const row = await c.env.DB.prepare(
    `INSERT INTO reservations (case_no, org_name, applicant_id, date, start_time, end_time, purpose, headcount, note, contact_name, contact_phone)
     VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
  )
    .bind(
      caseNo,
      b.org_name!.trim(),
      u.id,
      b.date,
      b.start_time,
      b.end_time,
      b.purpose!.trim(),
      b.headcount ?? null,
      b.note?.trim() || null,
      b.contact_name!.trim(),
      b.contact_phone!.trim(),
    )
    .first<Reservation>();
  await audit(c.env.DB, u.id, "reservation.create", "reservation", row!.id, { case_no: caseNo });
  const env = c.env;
  c.executionCtx.waitUntil(
    notifyHallManagers(env, caseNo, `${b.date} ${b.start_time}〜${b.end_time} ${b.org_name}`),
  );
  return c.json({ reservation: row });
});

// 繰り返し予約。埋まっている日は**飛ばして**残りを押さえ、結果をまとめて返す。
// (1日でも埋まっていたら全部やめる、では定例利用が組めないため)
reservations.post("/repeat", async (c) => {
  const u = requireActive(c);
  const b = await c.req.json<{
    org_name?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
    purpose?: string;
    headcount?: number;
    note?: string;
    contact_name?: string;
    contact_phone?: string;
    mode?: string;
    count?: number;
  }>();
  validateInput(b);
  validateHours(b.start_time!, b.end_time!, !!u.hall_early_access);
  const mode = (REPEAT_MODES as readonly string[]).includes(b.mode || "")
    ? (b.mode as RepeatMode)
    : null;
  if (!mode) throw new HttpError(400, "繰り返しの種類を選んでください");

  let dates = repeatDates(b.date!, mode);
  // 回数を指定された場合は先頭からその回数だけ(2ヶ月の上限は超えない)
  if (b.count && Number.isFinite(b.count)) {
    dates = dates.slice(0, Math.max(1, Math.floor(b.count)));
  }
  if (!dates.length) throw new HttpError(400, "予約する日がありません");

  const group = crypto.randomUUID();
  const created: { id: number; case_no: string; date: string }[] = [];
  const skipped: { date: string; reason: string }[] = [];

  for (const date of dates) {
    const overlap = await findOverlap(c.env.DB, date, b.start_time!, b.end_time!);
    if (overlap) {
      skipped.push({
        date,
        reason: overlap.status === "approved" ? "すでに予約が確定しています" : "仮予約が入っています",
      });
      continue;
    }
    const caseNo = await nextCaseNo(c.env.DB, "KY");
    const row = await c.env.DB.prepare(
      `INSERT INTO reservations (case_no, org_name, applicant_id, date, start_time, end_time, purpose, headcount, note, contact_name, contact_phone, repeat_group)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
    )
      .bind(
        caseNo,
        b.org_name!.trim(),
        u.id,
        date,
        b.start_time,
        b.end_time,
        b.purpose!.trim(),
        b.headcount ?? null,
        b.note?.trim() || null,
        b.contact_name!.trim(),
        b.contact_phone!.trim(),
        group,
      )
      .first<Reservation>();
    created.push({ id: row!.id, case_no: row!.case_no, date });
  }

  if (!created.length) {
    throw new HttpError(409, "ご希望の日はすべて予約が入っています。日時を変えてお試しください。");
  }
  await audit(c.env.DB, u.id, "reservation.create_repeat", "reservation", created[0].id, {
    group,
    mode,
    created: created.length,
    skipped: skipped.length,
  });

  // 会館係への通知は**1回にまとめる**(定例申込で通知が何通も飛ばないように)
  const env = c.env;
  c.executionCtx.waitUntil(
    notifyHallManagers(
      env,
      created[0].case_no,
      `${b.org_name} ${b.start_time}〜${b.end_time} の繰り返し申込 ${created.length}件` +
        `(${created[0].date}〜${created[created.length - 1].date})`,
    ),
  );
  return c.json({ group, created, skipped });
});

// 繰り返しでまとめて入れた予約を一括で取り消す(確定前・確定後どちらも本人が取り消せる)
reservations.post("/repeat/:group/cancel", async (c) => {
  const u = requireActive(c);
  const group = c.req.param("group");
  const rows = await c.env.DB.prepare(
    `SELECT * FROM reservations WHERE repeat_group=? AND applicant_id=? AND status IN ('received','checking','approved')`,
  )
    .bind(group, u.id)
    .all<Reservation>();
  if (!rows.results.length) throw new HttpError(404, "取り消せる予約がありません");
  await c.env.DB.prepare(
    "UPDATE reservations SET status='cancelled', updated_at=datetime('now') WHERE repeat_group=? AND applicant_id=? AND status IN ('received','checking','approved')",
  )
    .bind(group, u.id)
    .run();
  await audit(c.env.DB, u.id, "reservation.cancel_repeat", "reservation", rows.results[0].id, {
    group,
    count: rows.results.length,
  });
  const env = c.env;
  c.executionCtx.waitUntil(
    (async () => {
      for (const r of rows.results) await resolveWaitlist(env, r.id, false);
    })(),
  );
  return c.json({ ok: true, cancelled: rows.results.length });
});

// 仮予約(received/checking)の枠にキャンセル待ちとして登録(1予約につき1名まで)
reservations.post("/:id/waitlist", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const r = await c.env.DB.prepare("SELECT * FROM reservations WHERE id=?").bind(id).first<Reservation>();
  if (!r) throw new HttpError(404, "予約が見つかりません");
  if (!["received", "checking"].includes(r.status)) {
    throw new HttpError(400, "この予約は仮予約中ではないため、キャンセル待ちに登録できません");
  }
  if (r.applicant_id === u.id) throw new HttpError(400, "ご自身の申請にはキャンセル待ちを登録できません");
  try {
    await c.env.DB.prepare(
      "INSERT INTO reservation_waitlist (reservation_id, person_id) VALUES (?, ?)",
    )
      .bind(id, u.id)
      .run();
  } catch {
    throw new HttpError(409, "すでに他の方がキャンセル待ちに登録済みです");
  }
  await audit(c.env.DB, u.id, "reservation.waitlist_join", "reservation", id);
  return c.json({ ok: true });
});

reservations.post("/:id/waitlist/cancel", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const r = await c.env.DB.prepare(
    "DELETE FROM reservation_waitlist WHERE reservation_id=? AND person_id=?",
  )
    .bind(id, u.id)
    .run();
  if (!r.meta.changes) throw new HttpError(404, "キャンセル待ちの登録が見つかりません");
  await audit(c.env.DB, u.id, "reservation.waitlist_leave", "reservation", id);
  return c.json({ ok: true });
});

reservations.post("/:id/cancel", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const r = await c.env.DB.prepare("SELECT * FROM reservations WHERE id=?").bind(id).first<Reservation>();
  if (!r) throw new HttpError(404, "予約が見つかりません");
  const isHall = u.roles.some((x) => HALL.includes(x));
  if (r.applicant_id !== u.id && !isHall) throw new HttpError(403, "取消の権限がありません");
  if (!["received", "checking", "approved"].includes(r.status)) {
    throw new HttpError(400, "この状態の予約は取り消せません");
  }
  await c.env.DB.prepare(
    "UPDATE reservations SET status='cancelled', updated_at=datetime('now') WHERE id=?",
  )
    .bind(id)
    .run();
  await audit(c.env.DB, u.id, "reservation.cancel", "reservation", id);
  const env = c.env;
  c.executionCtx.waitUntil(resolveWaitlist(env, id, false));
  return c.json({ ok: true });
});

export default reservations;

// ============ 公開の会館予約(ログイン不要・オーナー指示 2026-07-30) ============
// 「会館の予約は誰でもできるように」。町会員でなくても借りられるようにする。
//
// 次回から楽に予約できるよう、電話番号で人物を作り **hall_user(会館予約者)** を付ける。
// ⚠ hall_user は町会の外の人。回覧・資料・会員名簿は見せない
//   (core.ts の isHallUserOnly と documents.readableLevels で除外している)。
// ⚠ ログイン不要なのでいたずら申込を防ぐ必要がある:
//    ハニーポット + IPごとのレート制限(1時間5件)。確定は会館係の承認が必要なので、
//    申込が入っただけでは会館は押さえられない。
/**
 * 公開フォームの申込者を電話番号で探し、いなければ「会館予約者」として作る。
 * 既に町会員として登録がある方は、その方として扱う(役割は変えない)。
 * 予約とキャンセル待ちの両方から使う。
 */
async function findOrCreateHallUserFull(
  c: { env: AppEnv["Bindings"] },
  b: { contact_name?: string; org_name?: string },
  phone: string,
  email: string,
): Promise<{ person: Person; created: boolean }> {
  const existing = await c.env.DB.prepare("SELECT * FROM persons WHERE phone=?")
    .bind(phone)
    .first<Person>();
  if (existing && existing.status === "left") {
    throw new HttpError(403, "この電話番号ではお申し込みできません。町会役員へご連絡ください。");
  }
  if (existing) return { person: existing, created: false };

  // メールが他の方と重複する場合は persons には入れない(予約側に残す)
  const dup = email
    ? await c.env.DB.prepare("SELECT 1 AS x FROM persons WHERE email=?").bind(email).first()
    : null;
  const person = (await c.env.DB.prepare(
    `INSERT INTO persons (name, phone, email, status, is_digital, note)
     VALUES (?,?,?, 'active', 1, ?) RETURNING *`,
  )
    .bind(
      (b.contact_name || "").trim(),
      phone,
      email && !dup ? email : null,
      `会館予約フォームから登録(${(b.org_name || "").trim()})`,
    )
    .first<Person>())!;
  await c.env.DB.prepare(
    "INSERT INTO role_assignments (person_id, role, granted_by) VALUES (?, ?, NULL)",
  )
    .bind(person.id, HALL_USER_ROLE)
    .run();
  return { person, created: true };
}

async function findOrCreateHallUser(
  c: { env: AppEnv["Bindings"] },
  b: { contact_name?: string; org_name?: string },
  phone: string,
  email: string,
): Promise<Person> {
  return (await findOrCreateHallUserFull(c, b, phone, email)).person;
}

export const publicReservations = new Hono<AppEnv>();

/**
 * 公開カレンダー(ログイン不要)。オーナー指示 2026-07-30。
 *
 * ⚠ **誰が予約・仮予約しているかは絶対に返さない**。
 *   団体名・申込者・受付番号・担当者名・電話番号はレスポンスに含めない。
 *   返すのは「日付・時間帯・確定/仮予約か・キャンセル待ちが既にいるか」だけ。
 *   ここに org_name などを足さないこと。
 */
publicReservations.get("/calendar", async (c) => {
  const from = c.req.query("from") || new Date().toISOString().slice(0, 10);
  const to = c.req.query("to") || "9999-12-31";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new HttpError(400, "日付が正しくありません");
  }
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.date, r.start_time, r.end_time, r.status,
            (SELECT COUNT(*) FROM reservation_waitlist w WHERE w.reservation_id=r.id) AS waiting
     FROM reservations r
     WHERE r.date>=? AND r.date<=? AND r.status IN ('received','checking','approved')
     ORDER BY r.date, r.start_time`,
  )
    .bind(from, to)
    .all<{
      id: number;
      date: string;
      start_time: string;
      end_time: string;
      status: string;
      waiting: number;
    }>();
  return c.json({
    slots: rows.results.map((r) => ({
      id: r.id,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      // 仮予約(received/checking)か確定(approved)か。誰かは出さない
      provisional: r.status !== "approved",
      // すでにキャンセル待ちの方がいるか(1件につき1名まで)
      has_waitlist: r.waiting > 0,
    })),
  });
});

publicReservations.post("/", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (await isRateLimited(c.env.DB, "hallres", ip, 5)) {
    throw new HttpError(429, "しばらくしてからもう一度お試しください");
  }
  const b = await c.req.json<{
    org_name?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
    purpose?: string;
    headcount?: number;
    note?: string;
    contact_name?: string;
    contact_phone?: string;
    contact_email?: string;
    // 先約が仮予約のとき、キャンセル待ちに登録してよいか(画面で確認を取る)
    waitlist?: boolean;
    hp?: string;
  }>();
  if (b.hp) return c.json({ ok: true }); // ボットには成功したように見せる
  validateInput(b);
  // 公開の申込は早朝利用の特例なし(8:00〜22:00)
  validateHours(b.start_time!, b.end_time!, false);

  const email = (b.contact_email || "").trim().toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, "メールアドレスの形式を確認してください");
  }
  const overlap = await findOverlap(c.env.DB, b.date!, b.start_time!, b.end_time!);
  const phone = validatePhone(b.contact_phone!);
  await recordAttempt(c.env.DB, "hallres", ip);

  // 先約がある場合の扱い(オーナー指示 2026-07-30):
  //  ・確定済み(approved)  … お断りする
  //  ・仮予約(received/checking) … **キャンセル待ちに登録できる**。
  //    先の申込が取り消されたら resolveWaitlist が通知(アプリ＋メール)する。
  //    キャンセル待ちは1枠につき1名まで(先着)。
  if (overlap && overlap.status === "approved") {
    throw new HttpError(409, "この時間帯はすでに予約が確定しています。別の日時をお選びください。");
  }
  if (overlap) {
    if (!b.waitlist) {
      throw new HttpError(409, "この時間帯は先に申し込みが入っています(まだ確定していません)。");
    }
    const taken = await c.env.DB.prepare(
      "SELECT 1 AS x FROM reservation_waitlist WHERE reservation_id=?",
    )
      .bind(overlap.id)
      .first();
    if (taken) {
      throw new HttpError(409, "この枠のキャンセル待ちは、すでに他の方が登録されています。");
    }
    const waiter = await findOrCreateHallUser(c, b, phone, email);
    await c.env.DB.prepare(
      "INSERT INTO reservation_waitlist (reservation_id, person_id) VALUES (?,?)",
    )
      .bind(overlap.id, waiter.id)
      .run();
    await audit(c.env.DB, null, "reservation.waitlist_public", "reservation", overlap.id, {
      person: waiter.id,
    });
    return c.json({ waitlisted: true, canLogin: true });
  }

  const { person, created: createdPerson } = await findOrCreateHallUserFull(c, b, phone, email);

  const caseNo = await nextCaseNo(c.env.DB, "KY");
  const row = await c.env.DB.prepare(
    `INSERT INTO reservations
       (case_no, org_name, applicant_id, date, start_time, end_time, purpose, headcount, note,
        contact_name, contact_phone, contact_email, created_via)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'public') RETURNING *`,
  )
    .bind(
      caseNo,
      b.org_name!.trim(),
      person.id,
      b.date,
      b.start_time,
      b.end_time,
      b.purpose!.trim(),
      b.headcount ?? null,
      b.note?.trim() || null,
      b.contact_name!.trim(),
      phone,
      email || null,
    )
    .first<Reservation>();
  await audit(c.env.DB, null, "reservation.create_public", "reservation", row!.id, {
    case_no: caseNo,
    new_person: createdPerson,
  });

  const env = c.env;
  c.executionCtx.waitUntil(
    notifyHallManagers(
      env,
      caseNo,
      `${b.date} ${b.start_time}〜${b.end_time} ${b.org_name}(公開フォームから)`,
    ),
  );
  return c.json({
    case_no: caseNo,
    // 次回からは電話番号でログインできる、と案内するために返す
    canLogin: true,
  });
});

// ============ 会館係向け ============
export const adminReservations = new Hono<AppEnv>();

// 予約のお知らせ(2日前未確定・前日確認・開始・終了10分前・終了)を今すぐ判定する。
// 通常はCronが5分ごとに回すが、動作確認したいときに管理者が押せるようにしてある。
adminReservations.post("/run-notices", async (c) => {
  const u = requireRoles(c, ["admin"]);
  const sent = await runReservationNotices(c.env);
  await audit(c.env.DB, u.id, "reservation.run_notices", undefined, undefined, sent);
  return c.json({ sent });
});


adminReservations.get("/", async (c) => {
  requireRoles(c, HALL);
  const status = c.req.query("status");
  const base = `SELECT r.*, p.name AS applicant_name, a.name AS assignee_name,
       w.person_id AS waitlist_person_id, wp.name AS waitlist_person_name
     FROM reservations r
     JOIN persons p ON p.id=r.applicant_id
     LEFT JOIN persons a ON a.id=r.assignee_id
     LEFT JOIN reservation_waitlist w ON w.reservation_id=r.id
     LEFT JOIN persons wp ON wp.id=w.person_id`;
  const rows = status
    ? await c.env.DB.prepare(`${base} WHERE r.status=? ORDER BY r.date, r.start_time LIMIT 200`)
        .bind(status)
        .all()
    : await c.env.DB.prepare(`${base} ORDER BY r.created_at DESC LIMIT 200`).all();
  return c.json({ reservations: rows.results });
});

// 「担当します」— 二人同時でも一人だけ成功する(排他更新)
adminReservations.post("/:id/claim", async (c) => {
  const u = requireRoles(c, HALL);
  const id = Number(c.req.param("id"));
  const r = await c.env.DB.prepare(
    `UPDATE reservations
     SET assignee_id=?, status=CASE WHEN status='received' THEN 'checking' ELSE status END,
         updated_at=datetime('now')
     WHERE id=? AND assignee_id IS NULL`,
  )
    .bind(u.id, id)
    .run();
  if (!r.meta.changes) throw new HttpError(409, "すでに他の係が担当しています");
  await audit(c.env.DB, u.id, "reservation.claim", "reservation", id);
  return c.json({ ok: true });
});

// 状態変更(承認・差戻し・利用済み)。申請者へ結果を通知。キャンセル待ちがいれば解消。
adminReservations.post("/:id/status", async (c) => {
  const u = requireRoles(c, HALL);
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ status?: string; reason?: string }>();
  const allowed = ["checking", "approved", "rejected", "done"];
  if (!b.status || !allowed.includes(b.status)) throw new HttpError(400, "状態の指定が正しくありません");
  const r = await c.env.DB.prepare("SELECT * FROM reservations WHERE id=?").bind(id).first<Reservation>();
  if (!r) throw new HttpError(404, "予約が見つかりません");
  if (["cancelled", "done"].includes(r.status)) throw new HttpError(400, "この予約は完了・取消済みです");
  await c.env.DB.prepare(
    "UPDATE reservations SET status=?, status_reason=?, updated_at=datetime('now') WHERE id=?",
  )
    .bind(b.status, b.reason?.trim() || null, id)
    .run();
  await audit(c.env.DB, u.id, "reservation.status", "reservation", id, {
    from: r.status,
    to: b.status,
    reason: b.reason,
  });
  const env = c.env;
  if (b.status === "approved" || b.status === "rejected") {
    const applicant = await c.env.DB.prepare("SELECT id, line_user_id FROM persons WHERE id=?")
      .bind(r.applicant_id)
      .first<{ id: number; line_user_id: string | null }>();
    if (applicant) {
      const text =
        b.status === "approved"
          ? `【会館予約】${r.case_no}\n${r.date} ${r.start_time}〜${r.end_time} の予約が承認されました。`
          : `【会館予約】${r.case_no}\n${r.date} ${r.start_time}〜${r.end_time} の申請は差戻しになりました。\n理由: ${b.reason || "アプリでご確認ください"}`;
      c.executionCtx.waitUntil(
        notifyPerson(env, env.DB, applicant, text, "reservation_result").then(() => {}),
      );
    }
    c.executionCtx.waitUntil(resolveWaitlist(env, id, b.status === "approved"));
  }
  return c.json({ ok: true });
});

// 紙・電話申請の代理入力(入力者を記録)
adminReservations.post("/proxy", async (c) => {
  const u = requireRoles(c, PROXY);
  const b = await c.req.json<{
    applicant_id?: number;
    org_name?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
    purpose?: string;
    headcount?: number;
    note?: string;
    contact_name?: string;
    contact_phone?: string;
  }>();
  if (!b.applicant_id) throw new HttpError(400, "申請者を選んでください");
  validateInput(b);
  const applicant = await c.env.DB.prepare("SELECT * FROM persons WHERE id=? AND status='active'")
    .bind(b.applicant_id)
    .first<Person>();
  if (!applicant) throw new HttpError(400, "申請者が見つかりません");
  validateHours(b.start_time!, b.end_time!, !!applicant.hall_early_access);
  const overlap = await findOverlap(c.env.DB, b.date!, b.start_time!, b.end_time!);
  if (overlap) {
    throw new HttpError(
      409,
      overlap.status === "approved"
        ? "この時間帯はすでに予約が確定しています"
        : "この時間帯は仮予約が入っています。キャンセル待ちとしてご案内ください。",
    );
  }
  const caseNo = await nextCaseNo(c.env.DB, "KY");
  const row = await c.env.DB.prepare(
    `INSERT INTO reservations (case_no, org_name, applicant_id, date, start_time, end_time, purpose, headcount, note, contact_name, contact_phone, proxy_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
  )
    .bind(
      caseNo,
      b.org_name!.trim(),
      b.applicant_id,
      b.date,
      b.start_time,
      b.end_time,
      b.purpose!.trim(),
      b.headcount ?? null,
      b.note?.trim() || null,
      b.contact_name!.trim(),
      b.contact_phone!.trim(),
      u.id,
    )
    .first<Reservation>();
  await audit(c.env.DB, u.id, "reservation.create_proxy", "reservation", row!.id, {
    case_no: caseNo,
    applicant_id: b.applicant_id,
  });
  const env = c.env;
  c.executionCtx.waitUntil(
    notifyHallManagers(env, caseNo, `${b.date} ${b.start_time}〜${b.end_time} ${b.org_name}(代理入力)`),
  );
  return c.json({ reservation: row });
});
