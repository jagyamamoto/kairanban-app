// 管理: 会員・役割・任期、グループ、監査ログ、通知使用量
import { Hono } from "hono";
import {
  type AppEnv,
  type Person,
  HttpError,
  MEMBER_ADMIN,
  PROXY,
  audit,
  jstMonth,
  requireRoles,
  validatePhone,
} from "../core";

const VALID_ROLES = [
  "member",
  "kodomo_parent",
  "kodomo_officer",
  "seniors_member",
  "officer",
  "hall_manager",
  "circular_manager",
  "pr",
  "senior_officer",
  "observer",
  "admin",
];

const admin = new Hono<AppEnv>();

// 代理入力用の名前リスト(役員向け・最小情報)
admin.get("/persons/options", async (c) => {
  requireRoles(c, PROXY);
  const rows = await c.env.DB.prepare(
    "SELECT id, name, is_digital FROM persons WHERE status='active' ORDER BY kana, name",
  ).all();
  return c.json({ persons: rows.results });
});

// ============ 会員管理 ============
admin.get("/members", async (c) => {
  requireRoles(c, MEMBER_ADMIN);
  const status = c.req.query("status");
  const rows = status
    ? await c.env.DB.prepare("SELECT * FROM persons WHERE status=? ORDER BY created_at DESC")
        .bind(status)
        .all<Person>()
    : await c.env.DB.prepare(
        "SELECT * FROM persons ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, created_at DESC",
      ).all<Person>();
  const roles = await c.env.DB.prepare(
    `SELECT person_id, role FROM role_assignments
     WHERE start_date<=date('now') AND (end_date IS NULL OR end_date>=date('now'))`,
  ).all<{ person_id: number; role: string }>();
  const roleMap = new Map<number, string[]>();
  for (const r of roles.results) {
    const list = roleMap.get(r.person_id) ?? [];
    list.push(r.role);
    roleMap.set(r.person_id, list);
  }
  const all = rows.results;
  // 重複登録の検出(オーナー依頼)。同じ電話番号・同姓同名・同一住所を候補として出す。
  // 自動では消さない(同居家族など正当な重複もあるため)。役員が見て判断する。
  const norm = (v: string | null) => (v ?? "").replace(/[\s　]/g, "");
  const dupOf = new Map<number, number[]>();
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.status === "left" || b.status === "left") continue;
      const samePhone = !!a.phone && a.phone === b.phone;
      const sameName = norm(a.name) !== "" && norm(a.name) === norm(b.name);
      const sameAddr =
        norm(a.address) !== "" && norm(a.address) === norm(b.address) && norm(a.name) === norm(b.name);
      if (samePhone || sameName || sameAddr) {
        dupOf.set(a.id, [...(dupOf.get(a.id) ?? []), b.id]);
        dupOf.set(b.id, [...(dupOf.get(b.id) ?? []), a.id]);
      }
    }
  }
  return c.json({
    members: all.map((p) => ({
      ...p,
      line_user_id: undefined,
      has_line: !!p.line_user_id,
      roles: roleMap.get(p.id) ?? [],
      duplicate_of: dupOf.get(p.id) ?? [],
    })),
  });
});

admin.get("/members/:id", async (c) => {
  requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  const p = await c.env.DB.prepare("SELECT * FROM persons WHERE id=?").bind(id).first<Person>();
  if (!p) throw new HttpError(404, "会員が見つかりません");
  const assignments = await c.env.DB.prepare(
    `SELECT ra.id, ra.role, ra.scope, ra.start_date, ra.end_date, g.name AS granted_by_name
     FROM role_assignments ra LEFT JOIN persons g ON g.id=ra.granted_by
     WHERE ra.person_id=? ORDER BY ra.created_at DESC`,
  )
    .bind(id)
    .all();
  return c.json({
    member: { ...p, line_user_id: undefined, has_line: !!p.line_user_id },
    assignments: assignments.results,
  });
});

// 会員の代理登録(即時有効)。アプリを使う方は電話番号が必須(ログインに使う)。
// 役割・会館の早朝利用可否もこの場で指定できる(役員が窓口で一度に登録できるように)。
admin.post("/members", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const b = await c.req.json<{
    name?: string;
    kana?: string;
    contact?: string;
    phone?: string;
    is_digital?: boolean;
    note?: string;
    roles?: string[];
    hall_early_access?: boolean;
  }>();
  if (!b.name?.trim()) throw new HttpError(400, "名前を入力してください");
  const isDigital = b.is_digital !== false;
  let phone: string | null = null;
  if (b.phone?.trim()) {
    phone = validatePhone(b.phone);
  } else if (isDigital) {
    throw new HttpError(400, "アプリを使う方は電話番号を入力してください");
  }
  // 'admin' は誤って配らないようこの経路では付与しない(付与は既存の役割追加から)
  const roles = (b.roles ?? []).filter((r) => VALID_ROLES.includes(r) && r !== "admin");
  if (roles.length === 0) roles.push("member");
  let row: Person;
  try {
    row = (await c.env.DB.prepare(
      `INSERT INTO persons (name, kana, contact, phone, is_digital, status, note, hall_early_access, approved_at, approved_by)
       VALUES (?,?,?,?,?,'active',?,?,datetime('now'),?) RETURNING *`,
    )
      .bind(
        b.name.trim(),
        b.kana?.trim() || null,
        b.contact?.trim() || null,
        phone,
        isDigital ? 1 : 0,
        b.note?.trim() || null,
        b.hall_early_access ? 1 : 0,
        u.id,
      )
      .first<Person>())!;
  } catch {
    throw new HttpError(400, "この電話番号またはメールアドレスはすでに登録されています");
  }
  for (const role of roles) {
    await c.env.DB.prepare(
      "INSERT INTO role_assignments (person_id, role, granted_by) VALUES (?, ?, ?)",
    )
      .bind(row.id, role, u.id)
      .run();
  }
  await audit(c.env.DB, u.id, "member.create_proxy", "person", row.id, {
    name: b.name.trim(),
    roles,
  });
  return c.json({ member: row });
});

// 承認(役割も同時に付与)
admin.post("/members/:id/approve", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ roles?: string[] }>().catch(() => ({}) as { roles?: string[] });
  const p = await c.env.DB.prepare("SELECT * FROM persons WHERE id=?").bind(id).first<Person>();
  if (!p) throw new HttpError(404, "会員が見つかりません");
  if (p.status === "left") throw new HttpError(400, "退会済みです");
  const roles = (b.roles?.length ? b.roles : ["member"]).filter((r) => VALID_ROLES.includes(r));
  if (!roles.length) throw new HttpError(400, "役割の指定が正しくありません");
  await c.env.DB.prepare(
    "UPDATE persons SET status='active', approved_at=datetime('now'), approved_by=? WHERE id=?",
  )
    .bind(u.id, id)
    .run();
  for (const role of roles) {
    const has = await c.env.DB.prepare(
      "SELECT 1 AS x FROM role_assignments WHERE person_id=? AND role=? AND (end_date IS NULL OR end_date>=date('now'))",
    )
      .bind(id, role)
      .first();
    if (!has) {
      await c.env.DB.prepare(
        "INSERT INTO role_assignments (person_id, role, granted_by) VALUES (?,?,?)",
      )
        .bind(id, role, u.id)
        .run();
    }
  }
  await audit(c.env.DB, u.id, "member.approve", "person", id, { roles });
  return c.json({ ok: true });
});

// 登録の取り消し。会員登録は自動承認になったため(オーナー方針)、
// 対象は 'pending' だけでなく自動登録済みの 'active' も含む。
// 監査ログを残したいので行は消さず status='left' にする。
admin.post("/members/:id/reject", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  if (id === u.id) throw new HttpError(400, "自分の登録は取り消せません");
  const p = await c.env.DB.prepare("SELECT status FROM persons WHERE id=?")
    .bind(id)
    .first<{ status: string }>();
  if (!p) throw new HttpError(404, "会員が見つかりません");
  await c.env.DB.prepare("UPDATE persons SET status='left' WHERE id=?").bind(id).run();
  // ログイン手段と権限も落とす(取り消した相手が入り続けないように)
  await c.env.DB.prepare(
    "UPDATE role_assignments SET end_date=date('now') WHERE person_id=? AND (end_date IS NULL OR end_date>date('now'))",
  )
    .bind(id)
    .run();
  await audit(c.env.DB, u.id, "member.reject", "person", id, { from: p.status });
  return c.json({ ok: true });
});

// 会員情報の更新(電話番号の登録・変更もここで行う)
admin.put("/members/:id", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{
    name?: string;
    kana?: string;
    contact?: string;
    phone?: string | null;
    lang?: string;
    is_digital?: boolean;
    note?: string;
    hall_early_access?: boolean;
    email?: string | null;
  }>();
  const p = await c.env.DB.prepare("SELECT * FROM persons WHERE id=?").bind(id).first<Person>();
  if (!p) throw new HttpError(404, "会員が見つかりません");
  const phone = b.phone === undefined ? p.phone : b.phone?.trim() ? validatePhone(b.phone) : null;
  try {
    await c.env.DB.prepare(
      "UPDATE persons SET name=?, kana=?, contact=?, phone=?, lang=?, is_digital=?, note=?, hall_early_access=?, email=? WHERE id=?",
    )
      .bind(
        b.name?.trim() || p.name,
        b.kana === undefined ? p.kana : b.kana?.trim() || null,
        b.contact === undefined ? p.contact : b.contact?.trim() || null,
        phone,
        b.lang || p.lang,
        b.is_digital == null ? p.is_digital : b.is_digital ? 1 : 0,
        b.note === undefined ? p.note : b.note?.trim() || null,
        b.hall_early_access == null ? p.hall_early_access : b.hall_early_access ? 1 : 0,
        b.email === undefined ? p.email : (b.email?.trim().toLowerCase() || null),
        id,
      )
      .run();
  } catch {
    throw new HttpError(400, "この電話番号またはメールアドレスはすでに登録されています");
  }
  await audit(c.env.DB, u.id, "member.update", "person", id);
  return c.json({ ok: true });
});

// 役割の付与(任期つき)
admin.post("/members/:id/roles", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ role?: string; end_date?: string; scope?: string }>();
  if (!b.role || !VALID_ROLES.includes(b.role)) throw new HttpError(400, "役割の指定が正しくありません");
  if (b.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.end_date)) {
    throw new HttpError(400, "任期末の日付が正しくありません");
  }
  await c.env.DB.prepare(
    "INSERT INTO role_assignments (person_id, role, scope, end_date, granted_by) VALUES (?,?,?,?,?)",
  )
    .bind(id, b.role, b.scope?.trim() || null, b.end_date || null, u.id)
    .run();
  await audit(c.env.DB, u.id, "member.role_grant", "person", id, {
    role: b.role,
    end_date: b.end_date,
  });
  return c.json({ ok: true });
});

// 役割の即時終了(任期終了・離任)
admin.post("/members/roles/:assignmentId/end", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const aid = Number(c.req.param("assignmentId"));
  const r = await c.env.DB.prepare(
    "UPDATE role_assignments SET end_date=date('now','-1 day') WHERE id=?",
  )
    .bind(aid)
    .run();
  if (!r.meta.changes) throw new HttpError(404, "役割が見つかりません");
  await audit(c.env.DB, u.id, "member.role_end", "role_assignment", aid);
  return c.json({ ok: true });
});

// 退会(権限を即時停止)
admin.post("/members/:id/leave", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE persons SET status='left' WHERE id=?").bind(id).run();
  await c.env.DB.prepare(
    "UPDATE role_assignments SET end_date=date('now','-1 day') WHERE person_id=? AND (end_date IS NULL OR end_date>=date('now'))",
  )
    .bind(id)
    .run();
  await audit(c.env.DB, u.id, "member.leave", "person", id);
  return c.json({ ok: true });
});

// ============ グループ ============
admin.get("/groups", async (c) => {
  requireRoles(c, MEMBER_ADMIN);
  const rows = await c.env.DB.prepare(
    `SELECT g.id, g.name, COUNT(gm.person_id) AS member_count
     FROM groups g LEFT JOIN group_members gm ON gm.group_id=g.id
     GROUP BY g.id ORDER BY g.name`,
  ).all();
  return c.json({ groups: rows.results });
});

admin.post("/groups", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const b = await c.req.json<{ name?: string }>();
  if (!b.name?.trim()) throw new HttpError(400, "グループ名を入力してください");
  const row = await c.env.DB.prepare("INSERT INTO groups (name) VALUES (?) RETURNING *")
    .bind(b.name.trim())
    .first();
  await audit(c.env.DB, u.id, "group.create", "group", (row as { id: number }).id);
  return c.json({ group: row });
});

admin.get("/groups/:id", async (c) => {
  requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.name FROM group_members gm JOIN persons p ON p.id=gm.person_id
     WHERE gm.group_id=? ORDER BY p.kana, p.name`,
  )
    .bind(id)
    .all();
  return c.json({ members: rows.results });
});

admin.post("/groups/:id/members", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ person_id?: number }>();
  if (!b.person_id) throw new HttpError(400, "会員を選んでください");
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO group_members (group_id, person_id) VALUES (?,?)",
  )
    .bind(id, b.person_id)
    .run();
  await audit(c.env.DB, u.id, "group.add_member", "group", id, { person_id: b.person_id });
  return c.json({ ok: true });
});

admin.delete("/groups/:id/members/:pid", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  const pid = Number(c.req.param("pid"));
  await c.env.DB.prepare("DELETE FROM group_members WHERE group_id=? AND person_id=?")
    .bind(id, pid)
    .run();
  await audit(c.env.DB, u.id, "group.remove_member", "group", id, { person_id: pid });
  return c.json({ ok: true });
});

// ============ 会員レベル(役割)の変更依頼 ============
admin.get("/role-requests", async (c) => {
  requireRoles(c, MEMBER_ADMIN);
  const rows = await c.env.DB.prepare(
    `SELECT rr.*, p.name AS person_name, h.name AS handled_by_name
     FROM role_requests rr
     JOIN persons p ON p.id=rr.person_id
     LEFT JOIN persons h ON h.id=rr.handled_by
     ORDER BY CASE rr.status WHEN 'new' THEN 0 ELSE 1 END, rr.created_at DESC LIMIT 200`,
  ).all();
  return c.json({ requests: rows.results });
});

admin.post("/role-requests/:id/status", async (c) => {
  const u = requireRoles(c, MEMBER_ADMIN);
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ status?: string }>();
  if (!b.status || !["new", "done", "declined"].includes(b.status)) {
    throw new HttpError(400, "状態の指定が正しくありません");
  }
  const r = await c.env.DB.prepare(
    "UPDATE role_requests SET status=?, handled_by=?, handled_at=datetime('now') WHERE id=?",
  )
    .bind(b.status, u.id, id)
    .run();
  if (!r.meta.changes) throw new HttpError(404, "依頼が見つかりません");
  await audit(c.env.DB, u.id, "role_request.status", "role_request", id, { status: b.status });
  return c.json({ ok: true });
});

// ============ 監査ログ ============
admin.get("/audit", async (c) => {
  requireRoles(c, MEMBER_ADMIN);
  const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
  const rows = await c.env.DB.prepare(
    `SELECT a.*, p.name AS actor_name FROM audit_log a
     LEFT JOIN persons p ON p.id=a.actor_id
     ORDER BY a.id DESC LIMIT ?`,
  )
    .bind(limit)
    .all();
  return c.json({ audit: rows.results });
});

// ============ 通知使用量(月200通の無料枠) ============
admin.get("/notifications/usage", async (c) => {
  requireRoles(c, MEMBER_ADMIN);
  const month = jstMonth();
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notification_log WHERE month=? AND status='sent'",
  )
    .bind(month)
    .first<{ n: number }>();
  return c.json({ month, sent: row?.n ?? 0, budget: 190, freeLimit: 200 });
});

export default admin;
