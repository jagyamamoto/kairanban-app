// 会合: 会員向け(一覧・詳細・出欠回答)と管理側(作成・公開・集計・代理入力・リマインド・CSV)
import { Hono } from "hono";
import {
  type AppEnv,
  HttpError,
  MEETING_MANAGE,
  audienceMatch,
  audit,
  nextCaseNo,
  requireActive,
  requireRoles,
  targetsForAudience,
} from "../core";
import { notifyPerson } from "../webpush";

type Meeting = {
  id: number;
  case_no: string;
  title: string;
  date: string;
  start_time: string | null;
  place: string | null;
  audience: string;
  has_meal: number;
  deadline: string | null;
  status: string;
  created_by: number;
  created_at: string;
};

type ResponseRow = {
  meeting_id: number;
  person_id: number;
  answer: string;
  headcount: number;
  meal_count: number;
  note: string | null;
  proxy_by: number | null;
  updated_at: string;
};

const AUDIENCES = ["all", "officers", "kodomo"];
function validateAudience(audience: string) {
  if (!AUDIENCES.includes(audience) && !/^group:\d+$/.test(audience)) {
    throw new HttpError(400, "対象の指定が正しくありません");
  }
}

const ANSWERS = ["yes", "no", "undecided"];
function validateResponse(b: { answer?: string; headcount?: number; meal_count?: number }) {
  if (!b.answer || !ANSWERS.includes(b.answer)) {
    throw new HttpError(400, "出欠の指定が正しくありません");
  }
  if (b.headcount != null && (!Number.isInteger(b.headcount) || b.headcount < 1 || b.headcount > 30)) {
    throw new HttpError(400, "人数の指定が正しくありません");
  }
  if (
    b.meal_count != null &&
    (!Number.isInteger(b.meal_count) || b.meal_count < 0 || b.meal_count > 30)
  ) {
    throw new HttpError(400, "食事数の指定が正しくありません");
  }
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ============ 会員向け ============
const meetings = new Hono<AppEnv>();

meetings.get("/", async (c) => {
  const u = requireActive(c);
  const rows = await c.env.DB.prepare(
    `SELECT m.*, mr.answer, mr.headcount, mr.meal_count
     FROM meetings m
     LEFT JOIN meeting_responses mr ON mr.meeting_id=m.id AND mr.person_id=?
     WHERE m.status IN ('open','closed','done')
     ORDER BY m.date DESC LIMIT 100`,
  )
    .bind(u.id)
    .all<Meeting & { answer: string | null; headcount: number | null; meal_count: number | null }>();
  const visible = [];
  for (const r of rows.results) {
    if (await audienceMatch(c.env.DB, r.audience, u)) visible.push(r);
  }
  return c.json({ meetings: visible });
});

meetings.get("/:id", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const m = await c.env.DB.prepare(
    "SELECT * FROM meetings WHERE id=? AND status IN ('open','closed','done')",
  )
    .bind(id)
    .first<Meeting>();
  if (!m) throw new HttpError(404, "会合が見つかりません");
  if (!(await audienceMatch(c.env.DB, m.audience, u))) {
    throw new HttpError(403, "この会合の対象ではありません");
  }
  const mine = await c.env.DB.prepare(
    "SELECT * FROM meeting_responses WHERE meeting_id=? AND person_id=?",
  )
    .bind(id, u.id)
    .first<ResponseRow>();
  return c.json({ meeting: m, response: mine ?? null });
});

// 出欠回答(締切後・締切中は不可)。自己回答すると代理入力の記録は上書きされる。
meetings.post("/:id/respond", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const m = await c.env.DB.prepare("SELECT * FROM meetings WHERE id=?").bind(id).first<Meeting>();
  if (!m) throw new HttpError(404, "会合が見つかりません");
  if (!(await audienceMatch(c.env.DB, m.audience, u))) {
    throw new HttpError(403, "この会合の対象ではありません");
  }
  if (m.status !== "open") throw new HttpError(400, "この会合は現在回答を受け付けていません");
  const b = await c.req.json<{
    answer?: string;
    headcount?: number;
    meal_count?: number;
    note?: string;
  }>();
  validateResponse(b);
  const headcount = b.headcount ?? 1;
  const mealCount = m.has_meal ? (b.meal_count ?? 0) : 0;
  await c.env.DB.prepare(
    `INSERT INTO meeting_responses (meeting_id, person_id, answer, headcount, meal_count, note, updated_at)
     VALUES (?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(meeting_id, person_id) DO UPDATE SET
       answer=excluded.answer, headcount=excluded.headcount, meal_count=excluded.meal_count,
       note=excluded.note, proxy_by=NULL, updated_at=datetime('now')`,
  )
    .bind(id, u.id, b.answer, headcount, mealCount, b.note?.trim() || null)
    .run();
  await audit(c.env.DB, u.id, "meeting.respond", "meeting", id, {
    answer: b.answer,
    headcount,
    meal_count: mealCount,
  });
  return c.json({ ok: true });
});

export default meetings;

// ============ 管理側 ============
export const adminMeetings = new Hono<AppEnv>();

adminMeetings.get("/", async (c) => {
  requireRoles(c, MEETING_MANAGE);
  const rows = await c.env.DB.prepare(
    `SELECT m.*, p.name AS created_by_name,
       (SELECT COUNT(*) FROM meeting_responses mr WHERE mr.meeting_id=m.id) AS response_count
     FROM meetings m JOIN persons p ON p.id=m.created_by
     ORDER BY m.date DESC LIMIT 200`,
  ).all();
  return c.json({ meetings: rows.results });
});

adminMeetings.post("/", async (c) => {
  const u = requireRoles(c, MEETING_MANAGE);
  const b = await c.req.json<{
    title?: string;
    date?: string;
    start_time?: string;
    place?: string;
    audience?: string;
    has_meal?: boolean;
    deadline?: string;
  }>();
  if (!b.title?.trim()) throw new HttpError(400, "会合名を入力してください");
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
    throw new HttpError(400, "開催日が正しくありません");
  }
  const audience = b.audience || "officers";
  validateAudience(audience);
  const caseNo = await nextCaseNo(c.env.DB, "KM");
  const row = await c.env.DB.prepare(
    `INSERT INTO meetings (case_no, title, date, start_time, place, audience, has_meal, deadline, status, created_by)
     VALUES (?,?,?,?,?,?,?,?,'draft',?) RETURNING *`,
  )
    .bind(
      caseNo,
      b.title.trim(),
      b.date,
      b.start_time || null,
      b.place?.trim() || null,
      audience,
      b.has_meal ? 1 : 0,
      b.deadline || null,
      u.id,
    )
    .first<Meeting>();
  await audit(c.env.DB, u.id, "meeting.create", "meeting", row!.id, { case_no: caseNo });
  return c.json({ meeting: row });
});

// 下書きのみ編集可
adminMeetings.put("/:id", async (c) => {
  const u = requireRoles(c, MEETING_MANAGE);
  const id = Number(c.req.param("id"));
  const m = await c.env.DB.prepare("SELECT * FROM meetings WHERE id=?").bind(id).first<Meeting>();
  if (!m) throw new HttpError(404, "会合が見つかりません");
  if (m.status !== "draft") throw new HttpError(400, "下書き状態の会合のみ編集できます");
  const b = await c.req.json<{
    title?: string;
    date?: string;
    start_time?: string | null;
    place?: string | null;
    audience?: string;
    has_meal?: boolean;
    deadline?: string | null;
  }>();
  const audience = b.audience ?? m.audience;
  validateAudience(audience);
  await c.env.DB.prepare(
    `UPDATE meetings SET title=?, date=?, start_time=?, place=?, audience=?, has_meal=?, deadline=? WHERE id=?`,
  )
    .bind(
      b.title?.trim() || m.title,
      b.date || m.date,
      b.start_time === undefined ? m.start_time : b.start_time || null,
      b.place === undefined ? m.place : b.place?.trim() || null,
      audience,
      b.has_meal == null ? m.has_meal : b.has_meal ? 1 : 0,
      b.deadline === undefined ? m.deadline : b.deadline || null,
      id,
    )
    .run();
  await audit(c.env.DB, u.id, "meeting.update", "meeting", id);
  return c.json({ ok: true });
});

// 状態変更: draft→open(公開・通知) / open⇄closed(締切・再開) / open・closed→done(終了)
adminMeetings.post("/:id/status", async (c) => {
  const u = requireRoles(c, MEETING_MANAGE);
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ status?: string }>();
  const allowed = ["open", "closed", "done"];
  if (!b.status || !allowed.includes(b.status)) {
    throw new HttpError(400, "状態の指定が正しくありません");
  }
  const m = await c.env.DB.prepare("SELECT * FROM meetings WHERE id=?").bind(id).first<Meeting>();
  if (!m) throw new HttpError(404, "会合が見つかりません");
  if (m.status === "done") throw new HttpError(400, "終了した会合は変更できません");
  const validFrom: Record<string, string[]> = {
    open: ["draft", "closed"],
    closed: ["open"],
    done: ["open", "closed"],
  };
  if (!validFrom[b.status].includes(m.status)) {
    throw new HttpError(400, "その状態には変更できません");
  }
  await c.env.DB.prepare("UPDATE meetings SET status=? WHERE id=?").bind(b.status, id).run();
  await audit(c.env.DB, u.id, "meeting.status", "meeting", id, { from: m.status, to: b.status });

  // 初回公開(下書き→受付中)時のみ対象者へ通知
  if (b.status === "open" && m.status === "draft") {
    const env = c.env;
    c.executionCtx.waitUntil(
      (async () => {
        const targets = await targetsForAudience(env.DB, m.audience);
        const text =
          `【${env.APP_NAME}】会合のご案内\n` +
          `「${m.title}」${m.date}\n` +
          (m.deadline ? `回答期限: ${m.deadline}\n` : "") +
          `アプリから出欠をご回答ください。`;
        for (const t of targets) {
          if (t.is_digital) await notifyPerson(env, env.DB, t, text, "meeting_new");
        }
      })(),
    );
  }
  return c.json({ ok: true });
});

// 出欠・食事・未回答の集計(オブザーバーはtargetsForAudienceの時点で除外)
adminMeetings.get("/:id/summary", async (c) => {
  requireRoles(c, MEETING_MANAGE);
  const id = Number(c.req.param("id"));
  const m = await c.env.DB.prepare("SELECT * FROM meetings WHERE id=?").bind(id).first<Meeting>();
  if (!m) throw new HttpError(404, "会合が見つかりません");
  const targets = await targetsForAudience(c.env.DB, m.audience);
  const respRows = await c.env.DB.prepare(
    `SELECT mr.*, pp.name AS proxy_name FROM meeting_responses mr
     LEFT JOIN persons pp ON pp.id=mr.proxy_by WHERE mr.meeting_id=?`,
  )
    .bind(id)
    .all<ResponseRow & { proxy_name: string | null }>();
  const respMap = new Map(respRows.results.map((r) => [r.person_id, r]));
  const list = targets.map((t) => {
    const r = respMap.get(t.id);
    return {
      person_id: t.id,
      name: t.name,
      answer: r?.answer ?? null,
      headcount: r?.headcount ?? null,
      meal_count: r?.meal_count ?? null,
      note: r?.note ?? null,
      proxy_name: r?.proxy_name ?? null,
      updated_at: r?.updated_at ?? null,
    };
  });
  const counts = { yes: 0, no: 0, undecided: 0, unanswered: 0, headcount: 0, meal: 0 };
  for (const x of list) {
    if (x.answer === "yes") {
      counts.yes++;
      counts.headcount += x.headcount ?? 0;
      counts.meal += x.meal_count ?? 0;
    } else if (x.answer === "no") counts.no++;
    else if (x.answer === "undecided") counts.undecided++;
    else counts.unanswered++;
  }
  return c.json({ meeting: m, targets: list, counts });
});

// 紙・電話回答/当日受付の代理入力(締切後でも当日受付として登録可能)
adminMeetings.post("/:id/proxy-respond", async (c) => {
  const u = requireRoles(c, MEETING_MANAGE);
  const id = Number(c.req.param("id"));
  const m = await c.env.DB.prepare("SELECT * FROM meetings WHERE id=?").bind(id).first<Meeting>();
  if (!m) throw new HttpError(404, "会合が見つかりません");
  if (!["open", "closed"].includes(m.status)) {
    throw new HttpError(400, "この会合は代理入力できません");
  }
  const b = await c.req.json<{
    person_id?: number;
    answer?: string;
    headcount?: number;
    meal_count?: number;
    note?: string;
  }>();
  if (!b.person_id) throw new HttpError(400, "対象者を選んでください");
  validateResponse(b);
  const headcount = b.headcount ?? 1;
  const mealCount = m.has_meal ? (b.meal_count ?? 0) : 0;
  await c.env.DB.prepare(
    `INSERT INTO meeting_responses (meeting_id, person_id, answer, headcount, meal_count, note, proxy_by, updated_at)
     VALUES (?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(meeting_id, person_id) DO UPDATE SET
       answer=excluded.answer, headcount=excluded.headcount, meal_count=excluded.meal_count,
       note=excluded.note, proxy_by=excluded.proxy_by, updated_at=datetime('now')`,
  )
    .bind(id, b.person_id, b.answer, headcount, mealCount, b.note?.trim() || null, u.id)
    .run();
  await audit(c.env.DB, u.id, "meeting.proxy_respond", "meeting", id, {
    person_id: b.person_id,
    answer: b.answer,
  });
  return c.json({ ok: true });
});

// 未回答者へリマインド
adminMeetings.post("/:id/remind", async (c) => {
  const u = requireRoles(c, MEETING_MANAGE);
  const id = Number(c.req.param("id"));
  const m = await c.env.DB.prepare("SELECT * FROM meetings WHERE id=? AND status='open'")
    .bind(id)
    .first<Meeting>();
  if (!m) throw new HttpError(404, "回答受付中の会合が見つかりません");
  const targets = await targetsForAudience(c.env.DB, m.audience);
  const respRows = await c.env.DB.prepare(
    "SELECT person_id FROM meeting_responses WHERE meeting_id=?",
  )
    .bind(id)
    .all<{ person_id: number }>();
  const answered = new Set(respRows.results.map((r) => r.person_id));
  const text =
    `【${c.env.APP_NAME}】会合の出欠回答をお願いします\n` +
    `「${m.title}」${m.date}\n` +
    (m.deadline ? `回答期限: ${m.deadline}\n` : "") +
    `アプリからご回答ください。`;
  let sent = 0;
  let skipped = 0;
  for (const t of targets) {
    if (answered.has(t.id)) continue;
    if (t.is_digital) {
      const st = await notifyPerson(c.env, c.env.DB, t, text, "meeting_remind");
      if (st.startsWith("sent")) sent++;
      else skipped++;
    } else {
      skipped++;
    }
  }
  await audit(c.env.DB, u.id, "meeting.remind", "meeting", id, { sent, skipped });
  return c.json({ ok: true, sent, skipped });
});

// 集計CSV(UTF-8 BOM付き)
adminMeetings.get("/:id/csv", async (c) => {
  const u = requireRoles(c, MEETING_MANAGE);
  const id = Number(c.req.param("id"));
  const m = await c.env.DB.prepare("SELECT * FROM meetings WHERE id=?").bind(id).first<Meeting>();
  if (!m) throw new HttpError(404, "会合が見つかりません");
  const targets = await targetsForAudience(c.env.DB, m.audience);
  const respRows = await c.env.DB.prepare(
    `SELECT mr.*, pp.name AS proxy_name FROM meeting_responses mr
     LEFT JOIN persons pp ON pp.id=mr.proxy_by WHERE mr.meeting_id=?`,
  )
    .bind(id)
    .all<ResponseRow & { proxy_name: string | null }>();
  const respMap = new Map(respRows.results.map((r) => [r.person_id, r]));
  const ANSWER_JA: Record<string, string> = { yes: "出席", no: "欠席", undecided: "未定" };
  const header = ["氏名", "回答", "人数", "食事数", "備考", "入力方法", "更新日時"];
  const lines = [header.map(csvEscape).join(",")];
  for (const t of targets) {
    const r = respMap.get(t.id);
    lines.push(
      [
        t.name,
        r ? (ANSWER_JA[r.answer] ?? r.answer) : "未回答",
        r ? String(r.headcount) : "",
        r ? String(r.meal_count) : "",
        r?.note ?? "",
        r ? (r.proxy_name ? `代理(${r.proxy_name})` : "本人") : "",
        r?.updated_at ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  await audit(c.env.DB, u.id, "meeting.csv_export", "meeting", id);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${m.case_no}.csv"`);
  return c.body("\uFEFF" + lines.join("\r\n"));
});
