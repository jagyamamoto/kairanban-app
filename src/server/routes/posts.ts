// ブログ(夏祭り・子ども会などの写真共有)。オーナー指示 2026-07-30。
// 「写真アルバム」から「ブログ」に名称変更(2026-07-30)。
//
// ⚠⚠ **一般公開は絶対にしない**。肖像権・個人情報のため、
//    選べる公開レベルから 'public' を外している(shared/levels.ts の POST_LEVELS)。
//    ここを緩めないこと。写真そのものも必ず権限チェックを通してから返す
//    (R2のキーを知られても、権限がなければ渡さない)。
//
// 公開レベルの既定は「投稿者と同じ高さ以上」。子ども会の役割しか無い人が投稿すると
// 既定は「子ども会のみ」になる。あとから投稿者(と上級役員・管理者)が変更できる。
import { Hono } from "hono";
import {
  type AppEnv,
  type User,
  HttpError,
  audit,
  isHallUserOnly,
  requireActive,
} from "../core";
import {
  POST_LEVELS,
  canViewAny,
  defaultLevelsFor,
  parseLevels,
  selectableLevels,
  viewableLevels,
} from "../../shared/levels";
import { contentTypeWithCharset } from "../share";

type Post = {
  id: number;
  title: string;
  body: string | null;
  levels: string; // JSONの配列。複数の公開先を持てる(オーナー指示)
  event_date: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

// 誰の投稿でも直せる役割
const POST_MANAGE = ["senior_officer", "admin"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 1枚10MBまで
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function canEdit(u: User, post: { created_by: number | null }): boolean {
  if (u.roles.some((r) => POST_MANAGE.includes(r))) return true;
  return post.created_by === u.id;
}

/** 公開先(複数)を検証して正規化する */
function validateLevels(levels: unknown, roles: string[]): string[] {
  const arr = Array.isArray(levels) ? levels.filter((x) => typeof x === "string") : [];
  if (arr.length === 0) throw new HttpError(400, "誰が見られるかを1つ以上選んでください");
  const uniq = [...new Set(arr)];
  for (const l of uniq) {
    // ⚠ POST_LEVELS に public は無い。ここが「一般公開しない」の実装上の砦。
    if (!POST_LEVELS.includes(l as never)) {
      throw new HttpError(400, "この公開範囲は写真には使えません");
    }
    if (!selectableLevels(roles, "post").includes(l as never)) {
      throw new HttpError(403, "この公開範囲は選べません");
    }
  }
  return uniq;
}

const posts = new Hono<AppEnv>();

/** 一覧(自分が見られるものだけ)。写真は1枚目をサムネイルとして返す。 */
posts.get("/", async (c) => {
  const u = requireActive(c);
  if (isHallUserOnly(u.roles)) throw new HttpError(403, "この画面の権限がありません");
  const levels = viewableLevels(u.roles).filter((l) => l !== "public");
  if (!levels.length) return c.json({ posts: [] });
  const q = (c.req.query("q") || "").trim();
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const where = [
    `EXISTS (SELECT 1 FROM json_each(p.levels) je WHERE je.value IN (${levels
      .map(() => "?")
      .join(",")}))`,
  ];
  const binds: unknown[] = [...levels];
  if (q) {
    where.push("(p.title LIKE ? ESCAPE '\\' OR IFNULL(p.body,'') LIKE ? ESCAPE '\\')");
    binds.push(like, like);
  }
  const rows = await c.env.DB.prepare(
    `SELECT p.*, a.name AS created_by_name,
            (SELECT COUNT(*) FROM post_photos ph WHERE ph.post_id=p.id) AS photo_count,
            (SELECT ph.id FROM post_photos ph WHERE ph.post_id=p.id ORDER BY ph.sort, ph.id LIMIT 1) AS cover_id
     FROM posts p LEFT JOIN persons a ON a.id=p.created_by
     WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(p.event_date, date(p.created_at)) DESC, p.id DESC
     LIMIT 200`,
  )
    .bind(...binds)
    .all();
  return c.json({
    posts: rows.results,
    selectableLevels: selectableLevels(u.roles, "post"),
    defaultLevels: defaultLevelsFor(u.roles),
    // 選べる公開範囲が無い人(一般会員)は投稿できない
    canPost: selectableLevels(u.roles, "post").length > 0,
    myId: u.id,
    canManageAll: u.roles.some((r) => POST_MANAGE.includes(r)),
  });
});

posts.get("/:id", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const post = await c.env.DB.prepare(
    "SELECT p.*, a.name AS created_by_name FROM posts p LEFT JOIN persons a ON a.id=p.created_by WHERE p.id=?",
  )
    .bind(id)
    .first<Post & { created_by_name: string | null }>();
  if (!post) throw new HttpError(404, "見つかりません");
  if (!canViewAny(u.roles, parseLevels(post.levels))) {
    throw new HttpError(403, "この写真を見る権限がありません");
  }
  const photos = await c.env.DB.prepare(
    "SELECT id, caption, file_name, sort FROM post_photos WHERE post_id=? ORDER BY sort, id",
  )
    .bind(id)
    .all();
  return c.json({ post, photos: photos.results, canEdit: canEdit(u, post) });
});

posts.post("/", async (c) => {
  const u = requireActive(c);
  if (isHallUserOnly(u.roles)) throw new HttpError(403, "この操作の権限がありません");
  if (selectableLevels(u.roles, "post").length === 0) {
    throw new HttpError(
      403,
      "投稿できるのは役員以上の方、または子ども会・シニアクラブなどの方です。町会役員へお声がけください。",
    );
  }
  const b = await c.req.json<{
    title?: string;
    body?: string;
    levels?: string[];
    event_date?: string;
  }>();
  if (!b.title?.trim()) throw new HttpError(400, "タイトルを入力してください");
  const levels = validateLevels(b.levels ?? defaultLevelsFor(u.roles), u.roles);
  if (b.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.event_date)) {
    throw new HttpError(400, "日付の形式が正しくありません");
  }
  const row = await c.env.DB.prepare(
    `INSERT INTO posts (title, body, levels, event_date, created_by) VALUES (?,?,?,?,?) RETURNING *`,
  )
    .bind(b.title.trim(), b.body?.trim() || null, JSON.stringify(levels), b.event_date || null, u.id)
    .first<Post>();
  await audit(c.env.DB, u.id, "post.create", "post", row!.id, { levels });
  return c.json({ post: row });
});

posts.put("/:id", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const post = await c.env.DB.prepare("SELECT * FROM posts WHERE id=?").bind(id).first<Post>();
  if (!post) throw new HttpError(404, "見つかりません");
  if (!canEdit(u, post)) throw new HttpError(403, "この投稿を直す権限がありません");
  const b = await c.req.json<{
    title?: string;
    body?: string | null;
    levels?: string[];
    event_date?: string | null;
  }>();
  const levels = validateLevels(b.levels ?? parseLevels(post.levels), u.roles);
  await c.env.DB.prepare(
    `UPDATE posts SET title=?, body=?, levels=?, event_date=?, updated_by=?, updated_at=datetime('now')
     WHERE id=?`,
  )
    .bind(
      b.title?.trim() || post.title,
      b.body === undefined ? post.body : b.body?.trim() || null,
      JSON.stringify(levels),
      b.event_date === undefined ? post.event_date : b.event_date || null,
      u.id,
      id,
    )
    .run();
  await audit(c.env.DB, u.id, "post.update", "post", id, { levels });
  return c.json({ ok: true });
});

/** 写真を追加(1枚ずつ)。画像以外・10MB超は受け付けない。 */
posts.post("/:id/photos", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const post = await c.env.DB.prepare("SELECT * FROM posts WHERE id=?").bind(id).first<Post>();
  if (!post) throw new HttpError(404, "見つかりません");
  if (!canEdit(u, post)) throw new HttpError(403, "この投稿に写真を追加する権限がありません");
  const form = await c.req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) throw new HttpError(400, "写真を選んでください");
  if (file.size > MAX_PHOTO_BYTES) throw new HttpError(400, "写真は1枚10MBまでにしてください");
  const type = file.type || "";
  if (!ALLOWED_TYPES.includes(type)) {
    throw new HttpError(400, "写真の形式が対応していません(JPEG・PNG・HEICなど)");
  }
  const key = `post-${id}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await c.env.IMAGES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type } });
  const max = await c.env.DB.prepare("SELECT IFNULL(MAX(sort),0) AS m FROM post_photos WHERE post_id=?")
    .bind(id)
    .first<{ m: number }>();
  const row = await c.env.DB.prepare(
    `INSERT INTO post_photos (post_id, r2_key, file_name, file_type, file_size, sort, created_by)
     VALUES (?,?,?,?,?,?,?) RETURNING id`,
  )
    .bind(id, key, file.name || null, type, file.size, (max?.m ?? 0) + 1, u.id)
    .first<{ id: number }>();
  await audit(c.env.DB, u.id, "post.add_photo", "post", id, { photo: row?.id });
  return c.json({ ok: true, photo_id: row?.id });
});

/** 写真の本体。⚠ 必ず投稿の公開レベルで権限を見てから返す。 */
posts.get("/photos/:photoId", async (c) => {
  const u = requireActive(c);
  const photoId = Number(c.req.param("photoId"));
  const row = await c.env.DB.prepare(
    `SELECT ph.r2_key, ph.file_type, ph.file_name, p.levels
     FROM post_photos ph JOIN posts p ON p.id=ph.post_id WHERE ph.id=?`,
  )
    .bind(photoId)
    .first<{ r2_key: string; file_type: string | null; file_name: string | null; levels: string }>();
  if (!row) throw new HttpError(404, "写真が見つかりません");
  if (!canViewAny(u.roles, parseLevels(row.levels))) {
    throw new HttpError(403, "この写真を見る権限がありません");
  }
  const obj = await c.env.IMAGES.get(row.r2_key);
  if (!obj) throw new HttpError(404, "写真が見つかりません");
  return new Response(obj.body, {
    headers: {
      "Content-Type": contentTypeWithCharset(row.file_type),
      // 非公開の写真なので共有端末に残さない
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
});

posts.delete("/photos/:photoId", async (c) => {
  const u = requireActive(c);
  const photoId = Number(c.req.param("photoId"));
  const row = await c.env.DB.prepare(
    `SELECT ph.id, ph.r2_key, ph.post_id, p.created_by
     FROM post_photos ph JOIN posts p ON p.id=ph.post_id WHERE ph.id=?`,
  )
    .bind(photoId)
    .first<{ id: number; r2_key: string; post_id: number; created_by: number | null }>();
  if (!row) throw new HttpError(404, "写真が見つかりません");
  if (!canEdit(u, row)) throw new HttpError(403, "この写真を消す権限がありません");
  await c.env.IMAGES.delete(row.r2_key).catch(() => {});
  await c.env.DB.prepare("DELETE FROM post_photos WHERE id=?").bind(photoId).run();
  await audit(c.env.DB, u.id, "post.delete_photo", "post", row.post_id, { photo: photoId });
  return c.json({ ok: true });
});

posts.delete("/:id", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const post = await c.env.DB.prepare("SELECT * FROM posts WHERE id=?").bind(id).first<Post>();
  if (!post) throw new HttpError(404, "見つかりません");
  if (!canEdit(u, post)) throw new HttpError(403, "この投稿を消す権限がありません");
  const photos = await c.env.DB.prepare("SELECT r2_key FROM post_photos WHERE post_id=?")
    .bind(id)
    .all<{ r2_key: string }>();
  for (const ph of photos.results) await c.env.IMAGES.delete(ph.r2_key).catch(() => {});
  await c.env.DB.prepare("DELETE FROM post_photos WHERE post_id=?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM posts WHERE id=?").bind(id).run();
  await audit(c.env.DB, u.id, "post.delete", "post", id, {
    title: post.title,
    photos: photos.results.length,
  });
  return c.json({ ok: true });
});

export default posts;
