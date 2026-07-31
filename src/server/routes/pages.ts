// 固定ページ(町会について・ゴミ出し情報・子ども会など): 公開表示(匿名・多言語)と管理
// 旧ホームページ(Jimdo)の内容統合が目的。回覧と違い、公開後も継続的に編集する前提(掲載期限なし)。
import { Hono } from "hono";
import {
  type AppEnv,
  CIRCULAR_APPROVE,
  CIRCULAR_CREATE,
  HttpError,
  audit,
  requireRoles,
} from "../core";
import { translatePage } from "../translate";

type Page = {
  id: number;
  slug: string;
  title: string;
  body: string;
  status: string;
  sort_order: number;
  updated_by: number;
  created_at: string;
  updated_at: string;
};

const SLUG_RE = /^[a-z0-9-]+$/;

// ============ 公開表示(匿名・掲載中のみ) ============
export const publicPages = new Hono<AppEnv>();

const PUBLIC_LANGS = ["ja", "ja-easy", "en", "zh", "vi"];

publicPages.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, slug, title, sort_order FROM pages WHERE status='published' ORDER BY sort_order, id",
  ).all<{ id: number; slug: string; title: string; sort_order: number }>();
  return c.json({ pages: rows.results });
});

publicPages.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const lang = PUBLIC_LANGS.includes(c.req.query("lang") || "") ? c.req.query("lang")! : "ja";
  const row = await c.env.DB.prepare(
    `SELECT p.id, p.slug, p.title, p.body, p.updated_at,
            t.title AS t_title, t.body AS t_body, t.quality
     FROM pages p
     LEFT JOIN page_translations t ON t.page_id=p.id AND t.lang=?
     WHERE p.slug=? AND p.status='published'`,
  )
    .bind(lang === "ja" ? "__none__" : lang, slug)
    .first<{
      id: number;
      slug: string;
      title: string;
      body: string;
      updated_at: string;
      t_title: string | null;
      t_body: string | null;
      quality: string | null;
    }>();
  if (!row) throw new HttpError(404, "ページが見つかりません");
  return c.json({
    lang,
    page: {
      id: row.id,
      slug: row.slug,
      title: row.t_title ?? row.title,
      body: row.t_body ?? row.body,
      updated_at: row.updated_at,
      translated: row.t_title != null,
      quality: row.quality,
    },
  });
});

// ============ 管理 ============
export const adminPages = new Hono<AppEnv>();

adminPages.get("/", async (c) => {
  requireRoles(c, CIRCULAR_CREATE);
  const rows = await c.env.DB.prepare(
    `SELECT p.*, u.name AS updated_by_name FROM pages p JOIN persons u ON u.id=p.updated_by
     ORDER BY p.sort_order, p.id`,
  ).all();
  return c.json({ pages: rows.results });
});

adminPages.post("/", async (c) => {
  const u = requireRoles(c, CIRCULAR_CREATE);
  const b = await c.req.json<{ slug?: string; title?: string; body?: string; sort_order?: number }>();
  const slug = (b.slug || "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new HttpError(400, "スラッグは半角英小文字・数字・ハイフンのみ使えます");
  }
  if (!b.title?.trim() || !b.body?.trim()) throw new HttpError(400, "タイトルと本文は必須です");
  let row: Page;
  try {
    row = (await c.env.DB.prepare(
      `INSERT INTO pages (slug, title, body, sort_order, status, updated_by) VALUES (?,?,?,?,'draft',?) RETURNING *`,
    )
      .bind(slug, b.title.trim(), b.body.trim(), b.sort_order ?? 0, u.id)
      .first<Page>())!;
  } catch {
    throw new HttpError(400, "そのスラッグは既に使われています");
  }
  await audit(c.env.DB, u.id, "page.create", "page", row.id, { slug });
  return c.json({ page: row });
});

// 公開後も継続編集する前提(回覧と異なり下書き限定にしない)
adminPages.put("/:id", async (c) => {
  const u = requireRoles(c, CIRCULAR_CREATE);
  const id = Number(c.req.param("id"));
  const p = await c.env.DB.prepare("SELECT * FROM pages WHERE id=?").bind(id).first<Page>();
  if (!p) throw new HttpError(404, "ページが見つかりません");
  const b = await c.req.json<{ title?: string; body?: string; sort_order?: number }>();
  await c.env.DB.prepare(
    "UPDATE pages SET title=?, body=?, sort_order=?, updated_by=?, updated_at=datetime('now') WHERE id=?",
  )
    .bind(b.title?.trim() || p.title, b.body?.trim() || p.body, b.sort_order ?? p.sort_order, u.id, id)
    .run();
  await audit(c.env.DB, u.id, "page.update", "page", id);
  return c.json({ ok: true });
});

adminPages.post("/:id/status", async (c) => {
  const u = requireRoles(c, CIRCULAR_APPROVE);
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ status?: string }>();
  if (!b.status || !["draft", "published"].includes(b.status)) {
    throw new HttpError(400, "状態の指定が正しくありません");
  }
  const r = await c.env.DB.prepare(
    "UPDATE pages SET status=?, updated_at=datetime('now') WHERE id=?",
  )
    .bind(b.status, id)
    .run();
  if (!r.meta.changes) throw new HttpError(404, "ページが見つかりません");
  await audit(c.env.DB, u.id, "page.status", "page", id, { status: b.status });
  return c.json({ ok: true });
});

adminPages.post("/:id/translate", async (c) => {
  const u = requireRoles(c, CIRCULAR_CREATE);
  const id = Number(c.req.param("id"));
  await translatePage(c.env, id);
  await audit(c.env.DB, u.id, "page.translate", "page", id);
  const rows = await c.env.DB.prepare(
    "SELECT lang, title, body, quality FROM page_translations WHERE page_id=?",
  )
    .bind(id)
    .all();
  return c.json({ translations: rows.results });
});

adminPages.get("/:id/translations", async (c) => {
  requireRoles(c, CIRCULAR_CREATE);
  const id = Number(c.req.param("id"));
  const rows = await c.env.DB.prepare(
    "SELECT lang, title, body, quality FROM page_translations WHERE page_id=?",
  )
    .bind(id)
    .all();
  return c.json({ translations: rows.results });
});

adminPages.put("/:id/translations/:lang", async (c) => {
  const u = requireRoles(c, CIRCULAR_CREATE);
  const id = Number(c.req.param("id"));
  const lang = c.req.param("lang");
  const b = await c.req.json<{ title?: string; body?: string }>();
  if (!b.title?.trim() || !b.body?.trim()) throw new HttpError(400, "タイトルと本文は必須です");
  await c.env.DB.prepare(
    `INSERT INTO page_translations (page_id, lang, title, body, quality)
     VALUES (?,?,?,?,'reviewed')
     ON CONFLICT(page_id, lang) DO UPDATE SET title=excluded.title, body=excluded.body, quality='reviewed'`,
  )
    .bind(id, lang, b.title.trim(), b.body.trim())
    .run();
  await audit(c.env.DB, u.id, "page.translation_review", "page", id, { lang });
  return c.json({ ok: true });
});
