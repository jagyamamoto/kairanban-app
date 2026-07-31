// 管理ホーム: 未読・未処理を一括で見せる(オーナー指示 2026-07-30)。
//
// ⚠ **その人の権限で扱えるものだけを返す**。
//   例) 町内会役員に子ども会の入会申込の件数は出さない。
//   件数だけでも「子ども会に3件申込がある」と分かってしまうため、権限のない項目は
//   そもそも配列に入れない。
import { Hono } from "hono";
import {
  type AppEnv,
  CIRCULAR_ACCESS,
  HALL,
  MEMBER_ADMIN,
  applicationKindsFor,
  canViewAudience,
  requireActive,
} from "../core";

export type DashItem = {
  key: string;
  label: string; // 何が待っているか
  count: number;
  path: string; // 管理画面のどこへ行けばよいか
  tone: "red" | "orange" | "green"; // 赤=対応が必要
  note?: string;
};

const dashboard = new Hono<AppEnv>();

const has = (roles: string[], allowed: string[]) => roles.some((r) => allowed.includes(r));

async function count(env: AppEnv["Bindings"], sql: string, ...binds: unknown[]): Promise<number> {
  const r = await env.DB.prepare(sql)
    .bind(...binds)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

dashboard.get("/", async (c) => {
  const u = requireActive(c);
  const db = c.env.DB;
  const items: DashItem[] = [];

  // ---- 入会申込(種類ごとに権限を見る) ----
  const kinds = applicationKindsFor(u.roles);
  if (kinds.includes("chonai")) {
    const n = await count(
      c.env,
      "SELECT COUNT(*) AS n FROM join_applications WHERE kind='chonai' AND status='new'",
    );
    items.push({
      key: "app_chonai",
      label: "町内会への入会申込(未対応)",
      count: n,
      path: "/admin/applications-chonai",
      tone: n ? "red" : "green",
    });
  }
  if (kinds.includes("kodomo")) {
    const n = await count(
      c.env,
      "SELECT COUNT(*) AS n FROM join_applications WHERE kind='kodomo' AND status='new'",
    );
    items.push({
      key: "app_kodomo",
      label: "子ども会への入会申込(未対応)",
      count: n,
      path: "/admin/applications-kodomo",
      tone: n ? "red" : "green",
    });
  }

  // ---- 会館予約 ----
  if (has(u.roles, HALL)) {
    const unassigned = await count(
      c.env,
      "SELECT COUNT(*) AS n FROM reservations WHERE status='received'",
    );
    items.push({
      key: "res_new",
      label: "会館予約(担当者がまだ決まっていない)",
      count: unassigned,
      path: "/admin/reservations",
      tone: unassigned ? "red" : "green",
    });
    const soon = await count(
      c.env,
      `SELECT COUNT(*) AS n FROM reservations
       WHERE status IN ('received','checking')
         AND date >= date('now') AND date <= date('now','+2 days')`,
    );
    if (soon) {
      items.push({
        key: "res_soon",
        label: "会館予約(2日以内の利用でまだ未確定)",
        count: soon,
        path: "/admin/reservations",
        tone: "red",
        note: "利用日が近いので早めに確定してください",
      });
    }
  }

  // ---- 会員管理 ----
  if (has(u.roles, MEMBER_ADMIN)) {
    const unreviewed = await count(
      c.env,
      "SELECT COUNT(*) AS n FROM persons WHERE status='pending' OR (status='active' AND approved_at IS NULL)",
    );
    items.push({
      key: "member_unreviewed",
      label: "確認が必要な会員(自動登録された方)",
      count: unreviewed,
      path: "/admin/members",
      tone: unreviewed ? "orange" : "green",
    });
    const roleReq = await count(
      c.env,
      "SELECT COUNT(*) AS n FROM role_requests WHERE status='new'",
    );
    items.push({
      key: "role_requests",
      label: "会員レベルの変更依頼(未対応)",
      count: roleReq,
      path: "/admin/role-requests",
      tone: roleReq ? "red" : "green",
    });
  }

  // ---- 回覧 ----
  if (has(u.roles, CIRCULAR_ACCESS)) {
    const draft = await count(
      c.env,
      "SELECT COUNT(*) AS n FROM circulars WHERE status IN ('draft','pending_approval')",
    );
    items.push({
      key: "circ_draft",
      label: "下書き・承認待ちの回覧",
      count: draft,
      path: "/admin/circulars",
      tone: draft ? "orange" : "green",
    });
    // 期限が近いのに確認が集まっていない回覧
    const dueSoon = await count(
      c.env,
      `SELECT COUNT(*) AS n FROM circulars
       WHERE status='published' AND deadline IS NOT NULL
         AND deadline >= date('now') AND deadline <= date('now','+3 days')`,
    );
    if (dueSoon) {
      items.push({
        key: "circ_due",
        label: "確認期限が3日以内の回覧",
        count: dueSoon,
        path: "/admin/circulars",
        tone: "orange",
        note: "未確認の方には自動でリマインドが飛びます",
      });
    }
  }

  // ---- 自分自身の未対応(役員も一人の会員なので) ----
  const myUnread = await db
    .prepare(
      `SELECT c.id, c.audience FROM circulars c
       LEFT JOIN circular_confirmations cc ON cc.circular_id=c.id AND cc.person_id=?
       WHERE c.status='published' AND c.visibility IN ('members','both') AND cc.confirmed_at IS NULL`,
    )
    .bind(u.id)
    .all<{ id: number; audience: string }>();
  let mine = 0;
  for (const r of myUnread.results) {
    if (await canViewAudience(db, r.audience, u)) mine++;
  }
  items.push({
    key: "my_unread",
    label: "あなたが未確認の回覧",
    count: mine,
    path: "/app/circulars",
    tone: mine ? "orange" : "green",
  });

  return c.json({ items, checkedAt: new Date().toISOString() });
});

export default dashboard;
