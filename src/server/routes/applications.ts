// 入会申込(町内会・子ども会): 公開フォーム(匿名・ログイン不要=地域住民向け)→担当役員へ通知→管理側で対応状況を管理
// フォーム項目は旧ホームページ(Jimdo)の実際の申込書に合わせている:
//   町内会: 氏名・ふりがな・住所・世帯人数・電話・メッセージ(年会費3,600円/世帯)
//   子ども会: 保護者代表者+お子様複数名(氏名・ふりがな・性別・学年・年齢)+
//             お手伝い保護者(最低1名)+保護者LINE ID+保険加入への同意(年会費600円/子)
import { Hono } from "hono";
import {
  type AppEnv,
  APPLICATION_VIEW,
  HttpError,
  applicationKindsFor,
  audit,
  isRateLimited,
  recordAttempt,
  requireRoles,
} from "../core";
import { notifyPerson } from "../webpush";
import { esc, mailEnabled, sendMail } from "../email";

type Application = {
  id: number;
  kind: string;
  name: string;
  kana: string | null;
  phone: string | null;
  address: string | null;
  message: string | null;
  detail: string | null;
  status: string;
  created_at: string;
  handled_by: number | null;
  handled_at: string | null;
};

type KodomoChild = { name?: string; kana?: string; gender?: string; grade?: string; age?: string };
type KodomoParent = { name?: string; kana?: string; age?: string };
type KodomoDetail = {
  children?: KodomoChild[];
  parents?: KodomoParent[];
  line_id?: string;
  consent?: boolean;
};
type ChonaiDetail = { household_size?: number };

const KIND_LABEL: Record<string, string> = { chonai: "町内会", kodomo: "子ども会" };
// 通知先: 町内会入会は一般役員+上級役員、子ども会入会は子ども会役員。いずれもadminへも通知。
const KIND_ROLES: Record<string, string[]> = {
  chonai: ["officer", "senior_officer", "admin"],
  kodomo: ["kodomo_officer", "admin"],
};
const MAX_CHILDREN = 4; // 元フォームの上限(5人以上は再度申込)
const MAX_HELPER_PARENTS = 2;

// ============ 公開: 申込フォーム(匿名) ============
export const publicApplications = new Hono<AppEnv>();

publicApplications.post("/", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (await isRateLimited(c.env.DB, "apply", ip, 5)) {
    throw new HttpError(429, "しばらくしてからもう一度お試しください");
  }
  type Body = {
    kind?: string;
    name?: string;
    kana?: string;
    phone?: string;
    address?: string;
    message?: string;
    detail?: ChonaiDetail | KodomoDetail;
    hp?: string; // ハニーポット(ボット対策・人は入力しない隠しフィールド)
  };
  const b = await c.req.json<Body>().catch(() => ({}) as Body);
  if (b.hp) return c.json({ ok: true }); // ボットには成功したように見せて何もしない
  if (!b.kind || !KIND_ROLES[b.kind]) throw new HttpError(400, "申込区分が正しくありません");
  const kind = b.kind;

  let name = b.name?.trim() || "";
  let detailToStore: unknown = null;

  if (kind === "kodomo") {
    const d = (b.detail || {}) as KodomoDetail;
    const children = (d.children || [])
      .filter((ch) => ch?.name?.trim())
      .slice(0, MAX_CHILDREN)
      .map((ch) => ({
        name: ch.name!.trim(),
        kana: ch.kana?.trim() || "",
        gender: ch.gender === "female" ? "female" : "male",
        grade: ch.grade?.trim() || "",
        age: ch.age?.trim() || "",
      }));
    const parents = (d.parents || [])
      .filter((p) => p?.name?.trim())
      .slice(0, MAX_HELPER_PARENTS)
      .map((p) => ({ name: p.name!.trim(), kana: p.kana?.trim() || "", age: p.age?.trim() || "" }));
    if (children.length === 0) throw new HttpError(400, "お子様のお名前を1名以上入力してください");
    if (parents.length === 0) {
      throw new HttpError(400, "お手伝いいただける保護者様のお名前を1名以上入力してください");
    }
    if (!d.consent) throw new HttpError(400, "保険加入についての同意にチェックしてください");
    if (!name) name = parents[0].name; // 代表者名が未入力ならお手伝い保護者(1)を代表者名とする
    detailToStore = { children, parents, line_id: d.line_id?.trim() || "" };
  } else {
    if (!name) throw new HttpError(400, "お名前を入力してください");
    const d = (b.detail || {}) as ChonaiDetail;
    const householdSize =
      d.household_size && Number.isInteger(d.household_size) && d.household_size > 0
        ? d.household_size
        : null;
    detailToStore = householdSize ? { household_size: householdSize } : null;
  }

  await recordAttempt(c.env.DB, "apply", ip);
  const row = (await c.env.DB.prepare(
    `INSERT INTO join_applications (kind, name, kana, phone, address, message, detail, ip)
     VALUES (?,?,?,?,?,?,?,?) RETURNING *`,
  )
    .bind(
      kind,
      name,
      b.kana?.trim() || null,
      b.phone?.trim() || null,
      b.address?.trim() || null,
      b.message?.trim() || null,
      detailToStore ? JSON.stringify(detailToStore) : null,
      ip,
    )
    .first<Application>())!;

  const env = c.env;
  const roles = KIND_ROLES[kind];
  c.executionCtx.waitUntil(
    (async () => {
      // 通知先はこの区分の担当役員。メールアドレスも取ってメールでも知らせる
      // (オーナー指示 2026-07-30: 子ども会の入会があったら担当役員にメールする)。
      // 宛先をコードに書かず役割で決めているので、担当が変わったら管理画面で足し引きすればよい。
      const rows = await env.DB.prepare(
        `SELECT DISTINCT p.id, p.name, p.line_user_id, p.email, p.email_optout FROM persons p
         JOIN role_assignments ra ON ra.person_id=p.id
         WHERE p.status='active' AND ra.role IN (${roles.map(() => "?").join(",")})
           AND ra.start_date<=date('now') AND (ra.end_date IS NULL OR ra.end_date>=date('now'))`,
      )
        .bind(...roles)
        .all<{
          id: number;
          name: string;
          line_user_id: string | null;
          email: string | null;
          email_optout: number;
        }>();
      let summary = `氏名: ${row.name}\n`;
      if (kind === "kodomo") {
        const d = detailToStore as KodomoDetail;
        summary += `お子様: ${(d.children || []).map((ch) => ch!.name).join("、")}\n`;
      }
      const text =
        `【${env.APP_NAME}】${KIND_LABEL[kind]}に新しい入会申込みがあります\n` +
        summary +
        (row.phone ? `電話: ${row.phone}\n` : "") +
        `管理画面の「入会申込」からご確認ください。`;
      for (const r of rows.results) {
        await notifyPerson(env, env.DB, r, text, "join_application");
      }

      // メールでもお知らせする。申込内容はここで全部見せる(管理画面を開かなくても分かるように)。
      if (mailEnabled(env)) {
        const subject = `【${env.APP_NAME}】${KIND_LABEL[kind]}の入会申込みがありました`;
        const lines: string[] = [`氏名: ${row.name}`];
        if (row.kana) lines.push(`ふりがな: ${row.kana}`);
        if (row.address) lines.push(`住所: ${row.address}`);
        if (row.phone) lines.push(`電話: ${row.phone}`);
        if (kind === "kodomo") {
          const d = detailToStore as KodomoDetail;
          for (const ch of d.children || []) {
            if (!ch?.name) continue;
            lines.push(
              `お子様: ${ch.name}${ch.kana ? `(${ch.kana})` : ""}` +
                `${ch.grade ? ` / ${ch.grade}` : ""}${ch.age ? ` / ${ch.age}歳` : ""}`,
            );
          }
          for (const pa of d.parents || []) {
            if (!pa?.name) continue;
            lines.push(`お手伝い保護者: ${pa.name}${pa.age ? `(${pa.age}歳)` : ""}`);
          }
          if (d.line_id) lines.push(`保護者のLINE ID: ${d.line_id}`);
          lines.push(`保険加入の同意: ${d.consent ? "あり" : "なし"}`);
        }
        if (row.message) lines.push(`メッセージ: ${row.message}`);
        const appUrl = (env.APP_URL || "").replace(/\/$/, "");
        const html =
          `<div style="font-family:'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;font-size:16px;line-height:1.8;color:#222">` +
          `<p><b>${esc(KIND_LABEL[kind])}の入会申込みがありました。</b></p>` +
          `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` +
          (appUrl
            ? `<p><a href="${appUrl}/admin/applications">管理画面の「入会申込」を開く</a></p>`
            : `<p>管理画面の「入会申込」からご対応をお願いします。</p>`) +
          `</div>`;
        const textBody = `${KIND_LABEL[kind]}の入会申込みがありました。\n\n${lines.join("\n")}\n\n${
          appUrl ? `${appUrl}/admin/applications` : "管理画面の「入会申込」からご対応をお願いします。"
        }\n`;
        for (const r of rows.results) {
          if (!r.email || r.email_optout) continue;
          await sendMail(env, r.email, subject, html, textBody);
        }
      }
    })(),
  );
  return c.json({ ok: true });
});

// ============ 管理: 一覧・対応状況 ============
export const adminApplications = new Hono<AppEnv>();

// 一覧は担当種類(町内会/子ども会)で絞る(管理閲覧権限.xlsx: 町内会役員は町会入会管理のみ、
// 子ども会役員はこども会入会管理のみ。上級役員・管理者は両方)
// 一覧。?kind=chonai|kodomo で絞れる。
// ⚠ 指定された種類を見る権限が無ければ**空ではなく403**を返す(画面を分けたので、
//   タブが見えていないのに直接URLを叩かれた場合をはっきり弾く)。
adminApplications.get("/", async (c) => {
  const u = requireRoles(c, APPLICATION_VIEW);
  const allowed = applicationKindsFor(u.roles);
  if (allowed.length === 0) return c.json({ applications: [], kinds: [] });
  const want = c.req.query("kind");
  if (want) {
    if (!KIND_ROLES[want]) throw new HttpError(400, "申込区分が正しくありません");
    if (!allowed.includes(want)) {
      throw new HttpError(403, "この入会申込を見る権限がありません");
    }
  }
  const kinds = want ? [want] : allowed;
  const rows = await c.env.DB.prepare(
    `SELECT a.*, h.name AS handled_by_name FROM join_applications a
     LEFT JOIN persons h ON h.id=a.handled_by
     WHERE a.kind IN (${kinds.map(() => "?").join(",")})
     ORDER BY CASE a.status WHEN 'new' THEN 0 ELSE 1 END, a.created_at DESC LIMIT 200`,
  )
    .bind(...kinds)
    .all();
  // 画面がどのタブを出すかを決めるため、見られる種類も返す
  return c.json({ applications: rows.results, kinds: allowed });
});

adminApplications.post("/:id/status", async (c) => {
  const u = requireRoles(c, APPLICATION_VIEW);
  const id = Number(c.req.param("id"));
  const app = await c.env.DB.prepare("SELECT kind FROM join_applications WHERE id=?")
    .bind(id)
    .first<{ kind: string }>();
  if (!app) throw new HttpError(404, "申込が見つかりません");
  if (!applicationKindsFor(u.roles).includes(app.kind)) {
    throw new HttpError(403, "この申込を操作する権限がありません");
  }
  const b = await c.req.json<{ status?: string }>();
  const allowed = ["new", "contacted", "done", "declined"];
  if (!b.status || !allowed.includes(b.status)) {
    throw new HttpError(400, "状態の指定が正しくありません");
  }
  const r = await c.env.DB.prepare(
    "UPDATE join_applications SET status=?, handled_by=?, handled_at=datetime('now') WHERE id=?",
  )
    .bind(b.status, u.id, id)
    .run();
  if (!r.meta.changes) throw new HttpError(404, "申込が見つかりません");
  await audit(c.env.DB, u.id, "application.status", "join_application", id, { status: b.status });
  return c.json({ ok: true });
});
