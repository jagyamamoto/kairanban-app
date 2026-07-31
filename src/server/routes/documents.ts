// 資料置き場: 町会の規約・総会/集会の報告資料などの共有(オーナー依頼)。
// 重要書類が多いため **既定は役員のみ**。level で公開範囲を切り替える。
//   officers = 役員のみ(既定) / members = 会員以上 / public = 誰でも(ログイン不要)
// 一覧だけでなく **ファイル取得も必ず権限チェックする**(URLを知られても漏れないように)。
import { Hono } from "hono";
import {
  type AppEnv,
  type User,
  HttpError,
  audit,
  isHallUserOnly,
  requireActive,
  requireRoles,
} from "../core";
import {
  DOC_LEVELS,
  canViewAny,
  defaultLevelsFor,
  parseLevels,
  selectableLevels,
  viewableLevels,
} from "../../shared/levels";
import { contentTypeWithCharset, hashPassword, newShareToken, suggestPassword } from "../share";

type Doc = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  levels: string; // JSONの配列。複数の公開先を持てる(オーナー指示)
  file_key: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  doc_date: string | null;
  created_at: string;
};

const CATEGORIES = ["rules", "minutes", "budget", "form", "other"];
// 資料を「誰の投稿でも」編集・削除できる役割。自分の投稿は本人も直せる。
const DOC_MANAGE = ["senior_officer", "admin"];

/** 公開先(複数)と種類を検証し、正規化した配列を返す */
function validateLevels(levels: unknown, category: string, roles: string[]): string[] {
  if (!CATEGORIES.includes(category)) throw new HttpError(400, "種類の指定が正しくありません");
  const arr = Array.isArray(levels) ? levels.filter((x) => typeof x === "string") : [];
  if (arr.length === 0) throw new HttpError(400, "誰が見られるかを1つ以上選んでください");
  const uniq = [...new Set(arr)];
  for (const l of uniq) {
    if (!DOC_LEVELS.includes(l as never)) {
      throw new HttpError(400, "公開範囲の指定が正しくありません");
    }
    // 自分が見られない公開先は選ばせない(置いた本人が開けなくなるため)
    if (!selectableLevels(roles, "doc").includes(l as never)) {
      throw new HttpError(403, "この公開範囲は選べません");
    }
  }
  return uniq;
}

/** この利用者が読める level の一覧。未ログインは public のみ。 */
export function readableLevels(user: User | null): string[] {
  // ⚠ ログインしていない人には**何も見せない**(オーナー指示 2026-07-30:
  //   町会資料の公開範囲から「どなたでも」を外した)。
  //   以前は ["public"] を返しており、古い資料に public が残っていると
  //   ログイン無しで読めてしまう状態だった。ここを ["public"] に戻さないこと。
  if (!user || user.status !== "active") return [];
  return viewableLevels(user.roles);
}

function canRead(user: User | null, levelsJson: string): boolean {
  // ⚠ 同上。ログインしていない人は、どの資料も読めない。
  if (!user || user.status !== "active") return false;
  return canViewAny(user.roles, parseLevels(levelsJson));
}

/** 自分の投稿か、資料管理者か */
function canEditDoc(user: User, doc: { created_by: number | null }): boolean {
  if (user.roles.some((r) => DOC_MANAGE.includes(r))) return true;
  return doc.created_by === user.id;
}

// ============ 閲覧(公開＋会員＋役員。levelで絞る) ============
const documents = new Hono<AppEnv>();

documents.get("/", async (c) => {
  const user = c.get("user");
  const levels = readableLevels(user);
  // 資料が増えると探せなくなるので検索を付ける(オーナー指示)。
  // タイトル・説明・ファイル名を対象にした部分一致。件数が数百なのでLIKEで足りる。
  const q = (c.req.query("q") || "").trim();
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const cat = c.req.query("category") || "";
  // levels(JSON配列)のどれか1つでも自分が見られるものと一致すれば表示する
  const where = [
    `EXISTS (SELECT 1 FROM json_each(d.levels) je WHERE je.value IN (${levels
      .map(() => "?")
      .join(",")}))`,
  ];
  const binds: unknown[] = [...levels];
  if (q) {
    where.push(
      "(d.title LIKE ? ESCAPE '\\' OR IFNULL(d.description,'') LIKE ? ESCAPE '\\' OR IFNULL(d.file_name,'') LIKE ? ESCAPE '\\')",
    );
    binds.push(like, like, like);
  }
  if (cat && CATEGORIES.includes(cat)) {
    where.push("d.category = ?");
    binds.push(cat);
  }
  const rows = await c.env.DB.prepare(
    `SELECT d.id, d.title, d.description, d.category, d.levels, d.file_name, d.file_type,
            d.file_size, d.doc_date, d.created_at, d.created_by, p.name AS created_by_name
     FROM documents d LEFT JOIN persons p ON p.id=d.created_by
     WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(d.doc_date, date(d.created_at)) DESC, d.id DESC
     LIMIT 300`,
  )
    .bind(...binds)
    .all();
  return c.json({
    documents: rows.results,
    levels,
    // 画面が「投稿できるか」「どのレベルを選べるか」を出すために返す
    // ⚠ 「会員全員」を選べるのは上級役員・管理者だけにしたため、
    //   一般会員は選べる公開範囲が無い=投稿できない。ボタンを出さず理由を説明する。
    canPost:
      !!user &&
      user.status === "active" &&
      !isHallUserOnly(user.roles) &&
      selectableLevels(user.roles, "doc").length > 0,
    selectableLevels: user ? selectableLevels(user.roles, "doc") : [],
    defaultLevels: user ? defaultLevelsFor(user.roles) : ["members"],
    myId: user?.id ?? null,
    canManageAll: !!user?.roles.some((r) => DOC_MANAGE.includes(r)),
  });
});

// ============ 会員による投稿(オーナー指示 2026-07-30) ============
// 会員が自分で資料を置ける。既定の公開レベルは「投稿者と同じ高さ以上」なので、
// 何も選ばなければ自分より下のレベルの人には見えない。
// ⚠ 会館予約者(町会の外の人)は投稿できない。
documents.post("/", async (c) => {
  const u = requireActive(c);
  if (isHallUserOnly(u.roles)) throw new HttpError(403, "この操作の権限がありません");
  if (selectableLevels(u.roles, "doc").length === 0) {
    throw new HttpError(
      403,
      "資料を置けるのは役員以上の方、または子ども会・シニアクラブなどの方です。町会役員へお声がけください。",
    );
  }
  const b = await c.req.json<{
    title?: string;
    description?: string;
    category?: string;
    levels?: string[];
    doc_date?: string;
  }>();
  if (!b.title?.trim()) throw new HttpError(400, "タイトルを入力してください");
  const category = b.category || "other";
  const levels = validateLevels(b.levels ?? defaultLevelsFor(u.roles), category, u.roles);
  if (b.doc_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.doc_date)) {
    throw new HttpError(400, "日付の形式が正しくありません");
  }
  const row = await c.env.DB.prepare(
    `INSERT INTO documents (title, description, category, levels, doc_date, created_by)
     VALUES (?,?,?,?,?,?) RETURNING *`,
  )
    .bind(
      b.title.trim(),
      b.description?.trim() || null,
      category,
      JSON.stringify(levels),
      b.doc_date || null,
      u.id,
    )
    .first<Doc & { created_by: number }>();
  await audit(c.env.DB, u.id, "document.create_self", "document", row!.id, { levels });
  return c.json({ document: row });
});

// 自分の投稿の公開レベル・内容を変える(資料管理者は誰の投稿でも変えられる)
documents.put("/:id", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id=?")
    .bind(id)
    .first<Doc & { created_by: number | null }>();
  if (!doc) throw new HttpError(404, "資料が見つかりません");
  if (!canEditDoc(u, doc)) throw new HttpError(403, "この資料を直す権限がありません");
  const b = await c.req.json<{
    title?: string;
    description?: string | null;
    category?: string;
    levels?: string[];
    doc_date?: string | null;
  }>();
  const category = b.category ?? doc.category;
  const levels = validateLevels(b.levels ?? parseLevels(doc.levels), category, u.roles);
  await c.env.DB.prepare(
    `UPDATE documents SET title=?, description=?, category=?, levels=?, doc_date=?,
       updated_by=?, updated_at=datetime('now') WHERE id=?`,
  )
    .bind(
      b.title?.trim() || doc.title,
      b.description === undefined ? doc.description : b.description?.trim() || null,
      category,
      JSON.stringify(levels),
      b.doc_date === undefined ? doc.doc_date : b.doc_date || null,
      u.id,
      id,
    )
    .run();
  await audit(c.env.DB, u.id, "document.update_self", "document", id, { levels });
  return c.json({ ok: true });
});

// 自分の投稿にファイルを付ける・差し替える(20MBまで)
documents.post("/:id/file", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id=?")
    .bind(id)
    .first<Doc & { created_by: number | null }>();
  if (!doc) throw new HttpError(404, "資料が見つかりません");
  if (!canEditDoc(u, doc)) throw new HttpError(403, "この資料を直す権限がありません");
  const form = await c.req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) throw new HttpError(400, "ファイルを選んでください");
  if (file.size > 20 * 1024 * 1024) throw new HttpError(400, "ファイルは20MBまでにしてください");
  const key = `doc-${id}-${Date.now()}`;
  await c.env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  if (doc.file_key) await c.env.IMAGES.delete(doc.file_key).catch(() => {});
  await c.env.DB.prepare(
    `UPDATE documents SET file_key=?, file_name=?, file_type=?, file_size=?,
       updated_by=?, updated_at=datetime('now') WHERE id=?`,
  )
    .bind(key, file.name || null, file.type || null, file.size, u.id, id)
    .run();
  await audit(c.env.DB, u.id, "document.upload_self", "document", id, { name: file.name });
  return c.json({ ok: true });
});

// 自分の投稿を消す(資料管理者は誰の投稿でも消せる)
documents.delete("/:id", async (c) => {
  const u = requireActive(c);
  const id = Number(c.req.param("id"));
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id=?")
    .bind(id)
    .first<Doc & { created_by: number | null }>();
  if (!doc) throw new HttpError(404, "資料が見つかりません");
  if (!canEditDoc(u, doc)) throw new HttpError(403, "この資料を消す権限がありません");
  if (doc.file_key) await c.env.IMAGES.delete(doc.file_key).catch(() => {});
  await c.env.DB.prepare("DELETE FROM document_shares WHERE document_id=?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM documents WHERE id=?").bind(id).run();
  await audit(c.env.DB, u.id, "document.delete_self", "document", id, { title: doc.title });
  return c.json({ ok: true });
});

// ファイル本体。URLを知られても権限がなければ渡さない。
documents.get("/:id/file", async (c) => {
  const id = Number(c.req.param("id"));
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id=?").bind(id).first<Doc>();
  if (!doc || !doc.file_key) throw new HttpError(404, "資料が見つかりません");
  const user = c.get("user");
  if (!canRead(user, doc.levels)) throw new HttpError(403, "この資料を見る権限がありません");
  const obj = await c.env.IMAGES.get(doc.file_key);
  if (!obj) throw new HttpError(404, "ファイルが見つかりません");
  const name = encodeURIComponent(doc.file_name || `document-${id}`);
  return new Response(obj.body, {
    headers: {
      "Content-Type": contentTypeWithCharset(doc.file_type),
      // 非公開資料はキャッシュさせない(共有端末対策)
      // 一般公開だけキャッシュしてよい。1つでも非公開の宛先が入っていれば残さない
      "Cache-Control":
        parseLevels(doc.levels).every((l) => l === "public")
          ? "public, max-age=3600"
          : "private, no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${name}`,
    },
  });
});

export default documents;

// ============ 管理(登録・差し替え・削除) ============
export const adminDocuments = new Hono<AppEnv>();

adminDocuments.get("/", async (c) => {
  requireRoles(c, DOC_MANAGE);
  const rows = await c.env.DB.prepare(
    `SELECT d.*, p.name AS created_by_name FROM documents d
     LEFT JOIN persons p ON p.id=d.created_by
     ORDER BY COALESCE(d.doc_date, date(d.created_at)) DESC, d.id DESC LIMIT 300`,
  ).all();
  return c.json({ documents: rows.results });
});

adminDocuments.post("/", async (c) => {
  const u = requireRoles(c, DOC_MANAGE);
  const b = await c.req.json<{
    title?: string;
    description?: string;
    category?: string;
    levels?: string[];
    doc_date?: string;
  }>();
  if (!b.title?.trim()) throw new HttpError(400, "タイトルを入力してください");
  const category = b.category || "other";
  // 既定は投稿者と同じ高さ以上(オーナー指示)。複数選択できる。
  const levels = validateLevels(b.levels ?? defaultLevelsFor(u.roles), category, u.roles);
  if (b.doc_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.doc_date)) {
    throw new HttpError(400, "日付の形式が正しくありません");
  }
  const row = await c.env.DB.prepare(
    `INSERT INTO documents (title, description, category, levels, doc_date, created_by)
     VALUES (?,?,?,?,?,?) RETURNING *`,
  )
    .bind(
      b.title.trim(),
      b.description?.trim() || null,
      category,
      JSON.stringify(levels),
      b.doc_date || null,
      u.id,
    )
    .first<Doc>();
  await audit(c.env.DB, u.id, "document.create", "document", row!.id, {
    title: b.title.trim(),
    levels,
  });
  return c.json({ document: row });
});

adminDocuments.put("/:id", async (c) => {
  const u = requireRoles(c, DOC_MANAGE);
  const id = Number(c.req.param("id"));
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id=?").bind(id).first<Doc>();
  if (!doc) throw new HttpError(404, "資料が見つかりません");
  const b = await c.req.json<{
    title?: string;
    description?: string | null;
    category?: string;
    levels?: string[];
    doc_date?: string | null;
  }>();
  const category = b.category ?? doc.category;
  const levels = validateLevels(b.levels ?? parseLevels(doc.levels), category, u.roles);
  await c.env.DB.prepare(
    `UPDATE documents SET title=?, description=?, category=?, levels=?, doc_date=?,
       updated_by=?, updated_at=datetime('now') WHERE id=?`,
  )
    .bind(
      b.title?.trim() || doc.title,
      b.description === undefined ? doc.description : b.description?.trim() || null,
      category,
      JSON.stringify(levels),
      b.doc_date === undefined ? doc.doc_date : b.doc_date || null,
      u.id,
      id,
    )
    .run();
  await audit(c.env.DB, u.id, "document.update", "document", id, { levels });
  return c.json({ ok: true });
});

// ファイルのアップロード・差し替え(20MBまで)
adminDocuments.post("/:id/file", async (c) => {
  const u = requireRoles(c, DOC_MANAGE);
  const id = Number(c.req.param("id"));
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id=?").bind(id).first<Doc>();
  if (!doc) throw new HttpError(404, "資料が見つかりません");
  const form = await c.req.formData();
  const file = form.get("image"); // クライアントのapiUpload()と同じフィールド名
  if (!(file instanceof File)) throw new HttpError(400, "ファイルを選んでください");
  if (file.size > 20 * 1024 * 1024) throw new HttpError(400, "ファイルは20MBまでにしてください");
  const key = `doc-${id}-${Date.now()}`;
  await c.env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  if (doc.file_key) await c.env.IMAGES.delete(doc.file_key).catch(() => {});
  await c.env.DB.prepare(
    "UPDATE documents SET file_key=?, file_name=?, file_type=?, file_size=?, updated_at=datetime('now') WHERE id=?",
  )
    .bind(key, file.name || null, file.type || null, file.size, id)
    .run();
  await audit(c.env.DB, u.id, "document.upload", "document", id, { name: file.name });
  return c.json({ ok: true });
});

// ============ 共有リンク(URL+パスワード) ============
// オーナー依頼: LINEオープンチャットなどに貼って、会員以外にも資料を見せられるようにする。
// ⚠ level の権限を意図的に迂回するので、作成できるのは資料管理者のみ。
//   パスワードと期限は必須。平文のパスワードは保存せず、作成時に一度だけ返す。
const SHARE_MAX_DAYS = 180;
const SHARE_DEFAULT_DAYS = 30;

adminDocuments.get("/:id/shares", async (c) => {
  requireRoles(c, DOC_MANAGE);
  const id = Number(c.req.param("id"));
  const rows = await c.env.DB.prepare(
    `SELECT id, token, label, expires_at, revoked_at, view_count, last_view_at, created_at
     FROM document_shares WHERE document_id=? ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(id)
    .all();
  return c.json({ shares: rows.results });
});

adminDocuments.post("/:id/shares", async (c) => {
  const u = requireRoles(c, DOC_MANAGE);
  const id = Number(c.req.param("id"));
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id=?").bind(id).first<Doc>();
  if (!doc) throw new HttpError(404, "資料が見つかりません");
  if (!doc.file_key) throw new HttpError(400, "先にファイルを登録してください");

  const b = await c.req.json<{ password?: string; days?: number; label?: string }>().catch(
    () => ({}) as { password?: string; days?: number; label?: string },
  );
  // 空欄なら読み上げやすいパスワードを自動で作る
  const password = (b.password || "").trim() || suggestPassword();
  if (password.length < 6) throw new HttpError(400, "パスワードは6文字以上にしてください");
  const days = Math.max(1, Math.min(SHARE_MAX_DAYS, Math.floor(b.days || SHARE_DEFAULT_DAYS)));
  const expires = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const { salt, hash } = await hashPassword(password);
  const token = newShareToken();
  const row = await c.env.DB.prepare(
    `INSERT INTO document_shares (document_id, token, pw_salt, pw_hash, label, expires_at, created_by)
     VALUES (?,?,?,?,?,?,?) RETURNING id, token, label, expires_at, created_at`,
  )
    .bind(id, token, salt, hash, b.label?.trim() || null, expires, u.id)
    .first();
  await audit(c.env.DB, u.id, "document.share_create", "document", id, {
    levels: parseLevels(doc.levels),
    expires_at: expires,
  });
  // パスワードはここでしか返さない(保存しているのはハッシュだけ)
  return c.json({ share: row, password, url: `/s/${token}` });
});

adminDocuments.post("/shares/:shareId/revoke", async (c) => {
  const u = requireRoles(c, DOC_MANAGE);
  const shareId = Number(c.req.param("shareId"));
  const s = await c.env.DB.prepare("SELECT document_id FROM document_shares WHERE id=?")
    .bind(shareId)
    .first<{ document_id: number }>();
  if (!s) throw new HttpError(404, "共有リンクが見つかりません");
  await c.env.DB.prepare(
    "UPDATE document_shares SET revoked_at=datetime('now') WHERE id=? AND revoked_at IS NULL",
  )
    .bind(shareId)
    .run();
  await audit(c.env.DB, u.id, "document.share_revoke", "document", s.document_id, { share: shareId });
  return c.json({ ok: true });
});

adminDocuments.delete("/:id", async (c) => {
  const u = requireRoles(c, DOC_MANAGE);
  const id = Number(c.req.param("id"));
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id=?").bind(id).first<Doc>();
  if (!doc) throw new HttpError(404, "資料が見つかりません");
  if (doc.file_key) await c.env.IMAGES.delete(doc.file_key).catch(() => {});
  await c.env.DB.prepare("DELETE FROM documents WHERE id=?").bind(id).run();
  await audit(c.env.DB, u.id, "document.delete", "document", id, { title: doc.title });
  return c.json({ ok: true });
});
