// 広告枠: 公開表示(匿名・掲載中のみ)と管理(作成・編集・状態変更)
// 将来LINE有料プランへ移行する際の運用資金づくりが目的(オーナー指示2026-07-28)。
import { Hono } from "hono";
import { type AppEnv, HttpError, MEMBER_ADMIN, audit, requireRoles } from "../core";

type Sponsor = {
  id: number;
  name: string;
  message: string;
  url: string | null;
  image_url: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  sort_order: number;
  created_by: number;
  created_at: string;
  updated_at: string;
};

function validateSponsor(b: {
  name: string;
  message: string;
  url?: string | null;
  image_url?: string | null;
}) {
  if (!b.name.trim()) throw new HttpError(400, "広告主名を入力してください");
  if (!b.message.trim()) throw new HttpError(400, "広告文を入力してください");
  if (b.url && !/^https?:\/\//.test(b.url)) {
    throw new HttpError(400, "リンク先URLはhttp://またはhttps://から始めてください");
  }
  if (b.image_url && !/^https:\/\//.test(b.image_url)) {
    throw new HttpError(400, "画像URLはhttps://から始めてください");
  }
}

// ============ 公開表示(匿名・公開PWA/会員ホーム共通) ============
export const publicSponsors = new Hono<AppEnv>();

publicSponsors.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, name, message, url, image_url FROM sponsors
     WHERE status='active'
       AND (start_date IS NULL OR start_date<=date('now'))
       AND (end_date IS NULL OR end_date>=date('now'))
     ORDER BY sort_order, id LIMIT 20`,
  ).all();
  return c.json({ sponsors: rows.results });
});

// ============ 管理(上級役員・管理者のみ。広告は業者取引を伴うため権限を絞る) ============
export const adminSponsors = new Hono<AppEnv>();

adminSponsors.get("/", async (c) => {
  requireRoles(c, MEMBER_ADMIN);
  const rows = await c.env.DB.prepare(
    `SELECT s.*, p.name AS created_by_name FROM sponsors s
     JOIN persons p ON p.id=s.created_by
     ORDER BY s.sort_order, s.id`,
  ).all();
  return c.json({ sponsors: rows.results });
});

adminSponsors.post("/", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const b = await c.req.json<{
    name?: string;
    message?: string;
    url?: string;
    image_url?: string;
    start_date?: string;
    end_date?: string;
    sort_order?: number;
  }>();
  const name = b.name?.trim() ?? "";
  const message = b.message?.trim() ?? "";
  validateSponsor({ name, message, url: b.url, image_url: b.image_url });
  const row = await c.env.DB.prepare(
    `INSERT INTO sponsors (name, message, url, image_url, start_date, end_date, sort_order, status, created_by)
     VALUES (?,?,?,?,?,?,?,'draft',?) RETURNING *`,
  )
    .bind(
      name,
      message,
      b.url?.trim() || null,
      b.image_url?.trim() || null,
      b.start_date || null,
      b.end_date || null,
      b.sort_order ?? 0,
      u.id,
    )
    .first<Sponsor>();
  await audit(c.env.DB, u.id, "sponsor.create", "sponsor", row!.id, { name });
  return c.json({ sponsor: row });
});

adminSponsors.put("/:id", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  const s = await c.env.DB.prepare("SELECT * FROM sponsors WHERE id=?").bind(id).first<Sponsor>();
  if (!s) throw new HttpError(404, "広告が見つかりません");
  const b = await c.req.json<{
    name?: string;
    message?: string;
    url?: string | null;
    image_url?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    sort_order?: number;
  }>();
  const name = b.name?.trim() || s.name;
  const message = b.message?.trim() || s.message;
  const url = b.url === undefined ? s.url : b.url?.trim() || null;
  const imageUrl = b.image_url === undefined ? s.image_url : b.image_url?.trim() || null;
  validateSponsor({ name, message, url, image_url: imageUrl });
  await c.env.DB.prepare(
    `UPDATE sponsors SET name=?, message=?, url=?, image_url=?, start_date=?, end_date=?, sort_order=?, updated_at=datetime('now')
     WHERE id=?`,
  )
    .bind(
      name,
      message,
      url,
      imageUrl,
      b.start_date === undefined ? s.start_date : b.start_date || null,
      b.end_date === undefined ? s.end_date : b.end_date || null,
      b.sort_order ?? s.sort_order,
      id,
    )
    .run();
  await audit(c.env.DB, u.id, "sponsor.update", "sponsor", id);
  return c.json({ ok: true });
});

adminSponsors.post("/:id/status", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ status?: string }>();
  const allowed = ["draft", "active", "archived"];
  if (!b.status || !allowed.includes(b.status)) {
    throw new HttpError(400, "状態の指定が正しくありません");
  }
  const r = await c.env.DB.prepare(
    "UPDATE sponsors SET status=?, updated_at=datetime('now') WHERE id=?",
  )
    .bind(b.status, id)
    .run();
  if (!r.meta.changes) throw new HttpError(404, "広告が見つかりません");
  await audit(c.env.DB, u.id, "sponsor.status", "sponsor", id, { status: b.status });
  return c.json({ ok: true });
});
