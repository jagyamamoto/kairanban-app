// 回覧: 会員向け(一覧・詳細・確認)と管理側(作成・承認・公開・確認状況・代理確認・リマインド)
import { Hono } from "hono";
import {
  type AppEnv,
  type User,
  CIRCULAR_ACCESS,
  CONFIRM_VIEW,
  HttpError,
  PROXY,
  audienceMatch,
  audit,
  canApproveCircularAudience,
  canDraftCircularAudience,
  canViewAudience,
  nextCaseNo,
  requireActive,
  requireRoles,
  targetsForAudience,
} from "../core";
import { notifyPerson } from "../webpush";
import { sendCircularEmails } from "../circularmail";
import { translateCircular } from "../translate";
import { runCircularEventNotices } from "../circularnotices";

type Circular = {
  id: number;
  case_no: string;
  title: string;
  body: string;
  audience: string;
  visibility: string; // 'members' | 'public' | 'both'
  deadline: string | null;
  publish_start_date: string | null;
  publish_end_date: string | null;
  event_date: string | null; // 行事の実施日(任意)。7日前・前日・当日に通知する
  status: string;
  image_key: string | null;
  created_by: number;
  approved_by: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

const AUDIENCES = ["all", "officers", "kodomo", "seniors"];
const VISIBILITIES = ["members", "public", "both"];

function validateAudience(audience: string) {
  if (!AUDIENCES.includes(audience) && !/^group:\d+$/.test(audience)) {
    throw new HttpError(400, "対象の指定が正しくありません");
  }
}
function validateVisibility(v: string) {
  if (!VISIBILITIES.includes(v)) throw new HttpError(400, "公開レベルの指定が正しくありません");
}
function validateDateField(v: string | null | undefined, label: string) {
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `${label}の形式が正しくありません`);
}
// この回覧(対象audience)を作成・編集してよいかを確認(管理閲覧権限.xlsxに基づく対象別スコープ)
function requireDraft(u: User, audience: string) {
  if (!canDraftCircularAudience(u.roles, audience)) {
    throw new HttpError(403, "この回覧を操作する権限がありません");
  }
}
// 承認・公開・終了してよいかを確認(pr・回覧担当は下書きまで。上級役員・管理者・担当役員は可)
function requireApprove(u: User, audience: string) {
  if (!canApproveCircularAudience(u.roles, audience)) {
    throw new HttpError(403, "この回覧を承認・公開する権限がありません");
  }
}

// ============ 会員向け ============
const circulars = new Hono<AppEnv>();

// 公開中に加え、終了済み(archived)も含めて過去の回覧を遡って閲覧できる。
// visibility='public'(非会員限定)は会員アプリの一覧には出さない。
circulars.get("/", async (c) => {
  const u = requireActive(c);
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.case_no, c.title, c.audience, c.deadline, c.event_date, c.published_at, c.status, c.image_key,
            cc.opened_at, cc.confirmed_at
     FROM circulars c
     LEFT JOIN circular_confirmations cc ON cc.circular_id=c.id AND cc.person_id=?
     WHERE c.status IN ('published','archived') AND c.visibility IN ('members','both')
     ORDER BY c.published_at DESC LIMIT 200`,
  )
    .bind(u.id)
    .all<Circular & { opened_at: string | null; confirmed_at: string | null }>();
  const visible = [];
  for (const r of rows.results) {
    if (await canViewAudience(c.env.DB, r.audience, u)) visible.push(r);
  }
  return c.json({ circulars: visible });
});

circulars.get("/:id", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare(
    "SELECT * FROM circulars WHERE id=? AND status IN ('published','archived') AND visibility IN ('members','both')",
  )
    .bind(id)
    .first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  if (!(await canViewAudience(c.env.DB, cir.audience, u))) {
    throw new HttpError(403, "この回覧の対象ではありません");
  }
  // 「開いた」を記録(「確認しました」とは別)
  await c.env.DB.prepare(
    `INSERT INTO circular_confirmations (circular_id, person_id, opened_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(circular_id, person_id)
     DO UPDATE SET opened_at=COALESCE(circular_confirmations.opened_at, excluded.opened_at)`,
  )
    .bind(id, u.id)
    .run();
  const mine = await c.env.DB.prepare(
    "SELECT opened_at, confirmed_at, method, proxy_by FROM circular_confirmations WHERE circular_id=? AND person_id=?",
  )
    .bind(id, u.id)
    .first();
  return c.json({ circular: cir, confirmation: mine });
});

// 正式な既読=「確認しました」
circulars.post("/:id/confirm", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare(
    "SELECT * FROM circulars WHERE id=? AND status='published' AND visibility IN ('members','both')",
  )
    .bind(id)
    .first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  if (!(await audienceMatch(c.env.DB, cir.audience, u))) {
    throw new HttpError(403, "この回覧の対象ではありません");
  }
  await c.env.DB.prepare(
    `INSERT INTO circular_confirmations (circular_id, person_id, opened_at, confirmed_at)
     VALUES (?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(circular_id, person_id)
     DO UPDATE SET confirmed_at=COALESCE(circular_confirmations.confirmed_at, excluded.confirmed_at)`,
  )
    .bind(id, u.id)
    .run();
  await audit(c.env.DB, u.id, "circular.confirm", "circular", id);
  return c.json({ ok: true });
});

export default circulars;

// ============ 画像配信(公開回覧は匿名可・非公開回覧は対象者のみ) ============
export const circularImages = new Hono<AppEnv>();

circularImages.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir || !cir.image_key) throw new HttpError(404, "画像が見つかりません");
  if (cir.visibility === "members") {
    const u = requireActive(c);
    if (!(await canViewAudience(c.env.DB, cir.audience, u))) {
      throw new HttpError(403, "この回覧の対象ではありません");
    }
  }
  const obj = await c.env.IMAGES.get(cir.image_key);
  if (!obj) throw new HttpError(404, "画像が見つかりません");
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
});

// ============ 管理側 ============
export const adminCirculars = new Hono<AppEnv>();

adminCirculars.get("/", async (c) => {
  requireRoles(c, CIRCULAR_ACCESS);
  const rows = await c.env.DB.prepare(
    `SELECT c.*, p.name AS created_by_name,
       (SELECT COUNT(*) FROM circular_confirmations cc WHERE cc.circular_id=c.id AND cc.confirmed_at IS NOT NULL) AS confirmed_count
     FROM circulars c JOIN persons p ON p.id=c.created_by
     ORDER BY c.created_at DESC LIMIT 200`,
  ).all();
  return c.json({ circulars: rows.results });
});

adminCirculars.post("/", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const b = await c.req.json<{
    title?: string;
    body?: string;
    audience?: string;
    visibility?: string;
    deadline?: string;
    publish_start_date?: string;
    publish_end_date?: string;
    event_date?: string;
  }>();
  if (!b.title?.trim() || !b.body?.trim()) throw new HttpError(400, "タイトルと本文は必須です");
  const audience = b.audience || "all";
  validateAudience(audience);
  requireDraft(u, audience);
  const visibility = b.visibility || "members";
  validateVisibility(visibility);
  validateDateField(b.publish_start_date, "掲載開始日");
  validateDateField(b.publish_end_date, "掲載終了日");
  validateDateField(b.event_date, "実施日");
  const caseNo = await nextCaseNo(c.env.DB, "KA");
  const row = await c.env.DB.prepare(
    `INSERT INTO circulars (case_no, title, body, audience, visibility, deadline, publish_start_date, publish_end_date, event_date, status, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,'draft',?) RETURNING *`,
  )
    .bind(
      caseNo,
      b.title.trim(),
      b.body.trim(),
      audience,
      visibility,
      b.deadline || null,
      b.publish_start_date || null,
      b.publish_end_date || null,
      b.event_date || null,
      u.id,
    )
    .first<Circular>();
  await audit(c.env.DB, u.id, "circular.create", "circular", row!.id, { case_no: caseNo });
  return c.json({ circular: row });
});

adminCirculars.put("/:id", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  if (!["draft", "pending_approval"].includes(cir.status)) {
    throw new HttpError(400, "公開済みの回覧は編集できません");
  }
  requireDraft(u, cir.audience);
  const b = await c.req.json<{
    title?: string;
    body?: string;
    audience?: string;
    visibility?: string;
    deadline?: string | null;
    publish_start_date?: string | null;
    publish_end_date?: string | null;
    event_date?: string | null;
  }>();
  const audience = b.audience ?? cir.audience;
  validateAudience(audience);
  requireDraft(u, audience); // 対象を変更する場合、変更後の対象も管理できる必要がある
  const visibility = b.visibility ?? cir.visibility;
  validateVisibility(visibility);
  validateDateField(b.publish_start_date, "掲載開始日");
  validateDateField(b.publish_end_date, "掲載終了日");
  validateDateField(b.event_date, "実施日");
  await c.env.DB.prepare(
    `UPDATE circulars SET title=?, body=?, audience=?, visibility=?, deadline=?, publish_start_date=?, publish_end_date=?, event_date=?, updated_at=datetime('now') WHERE id=?`,
  )
    .bind(
      b.title?.trim() || cir.title,
      b.body?.trim() || cir.body,
      audience,
      visibility,
      b.deadline === undefined ? cir.deadline : b.deadline || null,
      b.publish_start_date === undefined ? cir.publish_start_date : b.publish_start_date || null,
      b.publish_end_date === undefined ? cir.publish_end_date : b.publish_end_date || null,
      b.event_date === undefined ? cir.event_date : b.event_date || null,
      id,
    )
    .run();
  await audit(c.env.DB, u.id, "circular.update", "circular", id);
  return c.json({ ok: true });
});

// 画像の追加・差し替え(下書き・承認待ちのみ。5MBまで)
adminCirculars.post("/:id/image", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  requireDraft(u, cir.audience);
  if (!["draft", "pending_approval"].includes(cir.status)) {
    throw new HttpError(400, "公開済みの回覧には画像を追加できません");
  }
  const form = await c.req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) throw new HttpError(400, "画像ファイルを選択してください");
  if (!file.type.startsWith("image/")) throw new HttpError(400, "画像ファイルのみアップロードできます");
  if (file.size > 5 * 1024 * 1024) throw new HttpError(400, "画像は5MBまでにしてください");
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `circular-${id}-${Date.now()}.${ext}`;
  await c.env.IMAGES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  if (cir.image_key) await c.env.IMAGES.delete(cir.image_key).catch(() => {});
  await c.env.DB.prepare(
    "UPDATE circulars SET image_key=?, updated_at=datetime('now') WHERE id=?",
  )
    .bind(key, id)
    .run();
  await audit(c.env.DB, u.id, "circular.image_upload", "circular", id);
  return c.json({ ok: true, image_key: key });
});

adminCirculars.delete("/:id/image", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  requireDraft(u, cir.audience);
  if (cir.image_key) {
    await c.env.IMAGES.delete(cir.image_key).catch(() => {});
    await c.env.DB.prepare(
      "UPDATE circulars SET image_key=NULL, updated_at=datetime('now') WHERE id=?",
    )
      .bind(id)
      .run();
  }
  await audit(c.env.DB, u.id, "circular.image_remove", "circular", id);
  return c.json({ ok: true });
});

// 公開先(対象+掲載範囲)だけを更新。公開中・記録済みでも変更できる
// (オーナー指摘: 承認前しか対象を変えられず「出るときと出ないとき」があった)。
// 本文の編集は従来どおり下書き・承認待ちのみ。ここでは再通知も行わない。
adminCirculars.put("/:id/scope", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  requireDraft(u, cir.audience); // 変更前の対象を扱える人か
  const b = await c.req.json<{ audience?: string; visibility?: string }>();
  const audience = b.audience ?? cir.audience;
  validateAudience(audience);
  requireDraft(u, audience); // 変更後の対象も扱える人か
  const visibility = b.visibility ?? cir.visibility;
  validateVisibility(visibility);
  await c.env.DB.prepare(
    "UPDATE circulars SET audience=?, visibility=?, updated_at=datetime('now') WHERE id=?",
  )
    .bind(audience, visibility, id)
    .run();
  await audit(c.env.DB, u.id, "circular.scope_update", "circular", id, { audience, visibility });
  return c.json({ ok: true });
});

// 実施日のお知らせ(7日前・前日・当日)を今すぐ判定する。
// 通常はCronが自動で回すが、動作確認したいときに管理者が押せるようにしてある。
adminCirculars.post("/run-event-notices", async (c) => {
  const u = requireRoles(c, ["admin"]);
  const sent = await runCircularEventNotices(c.env);
  await audit(c.env.DB, u.id, "circular.run_event_notices", undefined, undefined, sent);
  return c.json({ sent });
});

// 掲載開始日・掲載終了日・実施日だけを更新(公開中・記録済みでもいつでも調整可能)。
// ⚠ 掲載終了日は「その日の23:59まで掲載」。記録へ移すのは翌日(cron.ts の archiveExpiredCirculars)。
adminCirculars.put("/:id/dates", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  requireDraft(u, cir.audience);
  const b = await c.req.json<{
    publish_start_date?: string | null;
    publish_end_date?: string | null;
    event_date?: string | null;
  }>();
  validateDateField(b.publish_start_date, "掲載開始日");
  validateDateField(b.publish_end_date, "掲載終了日");
  validateDateField(b.event_date, "実施日");
  const eventDate = b.event_date === undefined ? cir.event_date : b.event_date || null;
  await c.env.DB.prepare(
    "UPDATE circulars SET publish_start_date=?, publish_end_date=?, event_date=?, updated_at=datetime('now') WHERE id=?",
  )
    .bind(b.publish_start_date || null, b.publish_end_date || null, eventDate, id)
    .run();
  // 実施日を変えたら、すでに送った実施日のお知らせは送り直せるように台帳を消す
  if (eventDate !== cir.event_date) {
    await c.env.DB.prepare("DELETE FROM circular_notices WHERE circular_id=?").bind(id).run();
  }
  await audit(c.env.DB, u.id, "circular.dates_update", "circular", id, {
    publish_start_date: b.publish_start_date || null,
    publish_end_date: b.publish_end_date || null,
    event_date: eventDate,
  });
  return c.json({ ok: true });
});

// 下書き → 承認待ち
adminCirculars.post("/:id/submit", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  requireDraft(u, cir.audience);
  const r = await c.env.DB.prepare(
    "UPDATE circulars SET status='pending_approval', updated_at=datetime('now') WHERE id=? AND status='draft'",
  )
    .bind(id)
    .run();
  if (!r.meta.changes) throw new HttpError(400, "下書き状態の回覧のみ提出できます");
  await audit(c.env.DB, u.id, "circular.submit", "circular", id);
  return c.json({ ok: true });
});

// 承認して公開(その対象を管理できる役割)。公開時に翻訳とLINE通知を実行。
adminCirculars.post("/:id/publish", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  requireApprove(u, cir.audience);
  if (!["draft", "pending_approval", "archived"].includes(cir.status)) {
    throw new HttpError(400, "すでに公開済みです");
  }
  const republish = cir.status === "archived";
  await c.env.DB.prepare(
    "UPDATE circulars SET status='published', approved_by=?, published_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
  )
    .bind(u.id, id)
    .run();
  await audit(c.env.DB, u.id, "circular.publish", "circular", id, { case_no: cir.case_no, republish });

  const env = c.env;
  const reqUrl = c.req.url;
  c.executionCtx.waitUntil(
    (async () => {
      // 公開ページに載る場合(public/both)は多言語翻訳
      if (cir.visibility !== "members") await translateCircular(env, id);
      // 会員向け(members/both)のみ対象者へ通知。public限定は会員アプリの確認対象外のため通知しない。
      if (cir.visibility === "public") return;
      const targets = await targetsForAudience(env.DB, cir.audience);
      const text =
        `【${env.APP_NAME}】新しい回覧があります\n` +
        `「${cir.title}」\n` +
        (cir.deadline ? `確認期限: ${cir.deadline}\n` : "") +
        `アプリを開いて「確認しました」を押してください。`;
      for (const t of targets) {
        if (t.is_digital) {
          await notifyPerson(env, env.DB, t, text, "circular_new");
        }
      }
      // メールアドレスを登録した会員には、同じ範囲でメールも送る(オーナー指示)。
      // 開封と「確認しました」は circular_confirmations に入り、アプリと同じ扱いになる。
      const mail = await sendCircularEmails(env, reqUrl, {
        id,
        title: cir.title,
        body: cir.body,
        deadline: cir.deadline,
      });
      if (mail.sent || mail.failed) {
        await audit(env.DB, u.id, "circular.email_sent", "circular", id, mail);
      }
    })(),
  );
  return c.json({ ok: true });
});

adminCirculars.post("/:id/archive", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  requireApprove(u, cir.audience);
  await c.env.DB.prepare(
    "UPDATE circulars SET status='archived', updated_at=datetime('now') WHERE id=?",
  )
    .bind(id)
    .run();
  await audit(c.env.DB, u.id, "circular.archive", "circular", id);
  return c.json({ ok: true });
});

// 確認状況(対象者数・確認済み・未確認者)。オブザーバー閲覧不可。
adminCirculars.get("/:id/status", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  if (!u.roles.some((r) => CONFIRM_VIEW.includes(r)) && !canDraftCircularAudience(u.roles, cir.audience)) {
    throw new HttpError(403, "この操作の権限がありません");
  }
  const targets = await targetsForAudience(c.env.DB, cir.audience);
  const ccRows = await c.env.DB.prepare(
    `SELECT cc.person_id, cc.opened_at, cc.confirmed_at, cc.method, cc.proxy_by, pp.name AS proxy_name
     FROM circular_confirmations cc LEFT JOIN persons pp ON pp.id=cc.proxy_by
     WHERE cc.circular_id=?`,
  )
    .bind(id)
    .all<{
      person_id: number;
      opened_at: string | null;
      confirmed_at: string | null;
      method: string;
      proxy_by: number | null;
      proxy_name: string | null;
    }>();
  const ccMap = new Map(ccRows.results.map((r) => [r.person_id, r]));
  const subRows = await c.env.DB.prepare(
    "SELECT DISTINCT person_id FROM push_subscriptions",
  ).all<{ person_id: number }>();
  const subSet = new Set(subRows.results.map((r) => r.person_id));
  const list = targets.map((t) => {
    const cc = ccMap.get(t.id);
    return {
      person_id: t.id,
      name: t.name,
      is_digital: t.is_digital,
      notifiable: (subSet.has(t.id) || !!t.line_user_id) && !!t.is_digital,
      opened_at: cc?.opened_at ?? null,
      confirmed_at: cc?.confirmed_at ?? null,
      method: cc?.confirmed_at ? cc.method : null,
      proxy_name: cc?.proxy_name ?? null,
    };
  });
  const confirmed = list.filter((x) => x.confirmed_at).length;
  return c.json({
    circular: cir,
    targets: list,
    counts: { total: list.length, confirmed, unconfirmed: list.length - confirmed },
  });
});

// 紙・電話での確認を担当者が代理入力
adminCirculars.post("/:id/proxy-confirm", async (c) => {
  const u = requireRoles(c, PROXY);
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ person_id?: number; method?: string }>();
  if (!b.person_id) throw new HttpError(400, "対象者を選んでください");
  const method = b.method === "phone" ? "phone" : "paper";
  await c.env.DB.prepare(
    `INSERT INTO circular_confirmations (circular_id, person_id, confirmed_at, method, proxy_by)
     VALUES (?, ?, datetime('now'), ?, ?)
     ON CONFLICT(circular_id, person_id)
     DO UPDATE SET confirmed_at=COALESCE(circular_confirmations.confirmed_at, excluded.confirmed_at),
                   method=excluded.method, proxy_by=excluded.proxy_by`,
  )
    .bind(id, b.person_id, method, u.id)
    .run();
  await audit(c.env.DB, u.id, "circular.proxy_confirm", "circular", id, {
    person_id: b.person_id,
    method,
  });
  return c.json({ ok: true });
});

// 未確認者へリマインド通知
adminCirculars.post("/:id/remind", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=? AND status='published'")
    .bind(id)
    .first<Circular>();
  if (!cir) throw new HttpError(404, "公開中の回覧が見つかりません");
  if (!u.roles.some((r) => CONFIRM_VIEW.includes(r)) && !canDraftCircularAudience(u.roles, cir.audience)) {
    throw new HttpError(403, "この操作の権限がありません");
  }
  const targets = await targetsForAudience(c.env.DB, cir.audience);
  const ccRows = await c.env.DB.prepare(
    "SELECT person_id FROM circular_confirmations WHERE circular_id=? AND confirmed_at IS NOT NULL",
  )
    .bind(id)
    .all<{ person_id: number }>();
  const confirmedIds = new Set(ccRows.results.map((r) => r.person_id));
  const text =
    `【${c.env.APP_NAME}】回覧のご確認をお願いします\n` +
    `「${cir.title}」\n` +
    (cir.deadline ? `確認期限: ${cir.deadline}\n` : "") +
    `アプリを開いて「確認しました」を押してください。`;
  let sent = 0;
  let skipped = 0;
  for (const t of targets) {
    if (confirmedIds.has(t.id)) continue;
    if (t.is_digital) {
      const st = await notifyPerson(c.env, c.env.DB, t, text, "circular_remind");
      if (st.startsWith("sent")) sent++;
      else skipped++;
    } else {
      skipped++;
    }
  }
  await audit(c.env.DB, u.id, "circular.remind", "circular", id, { sent, skipped });
  return c.json({ ok: true, sent, skipped });
});

// 翻訳の再生成と一覧
adminCirculars.post("/:id/translate", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  requireDraft(u, cir.audience);
  await translateCircular(c.env, id);
  await audit(c.env.DB, u.id, "circular.translate", "circular", id);
  const rows = await c.env.DB.prepare(
    "SELECT lang, title, body, quality FROM circular_translations WHERE circular_id=?",
  )
    .bind(id)
    .all();
  return c.json({ translations: rows.results });
});

adminCirculars.get("/:id/translations", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  requireDraft(u, cir.audience);
  const rows = await c.env.DB.prepare(
    "SELECT lang, title, body, quality FROM circular_translations WHERE circular_id=?",
  )
    .bind(id)
    .all();
  return c.json({ translations: rows.results });
});

// 翻訳の手直し(確認済みとして保存)
adminCirculars.put("/:id/translations/:lang", async (c) => {
  const u = requireRoles(c, CIRCULAR_ACCESS);
  const id = Number(c.req.param("id"));
  const cir = await c.env.DB.prepare("SELECT * FROM circulars WHERE id=?").bind(id).first<Circular>();
  if (!cir) throw new HttpError(404, "回覧が見つかりません");
  requireDraft(u, cir.audience);
  const lang = c.req.param("lang");
  const b = await c.req.json<{ title?: string; body?: string }>();
  if (!b.title?.trim() || !b.body?.trim()) throw new HttpError(400, "タイトルと本文は必須です");
  await c.env.DB.prepare(
    `INSERT INTO circular_translations (circular_id, lang, title, body, quality)
     VALUES (?,?,?,?,'reviewed')
     ON CONFLICT(circular_id, lang) DO UPDATE SET title=excluded.title, body=excluded.body, quality='reviewed'`,
  )
    .bind(id, lang, b.title.trim(), b.body.trim())
    .run();
  await audit(c.env.DB, u.id, "circular.translation_review", "circular", id, { lang });
  return c.json({ ok: true });
});
