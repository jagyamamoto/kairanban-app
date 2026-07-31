// 回覧のメール配信と、開封確認。
//
// オーナー指示(2026-07-29):
//  - メールアドレスを登録した会員には、**閲覧できる範囲の回覧だけ**をメールでも送る
//  - できるだけ「開封確認メール」にして、開封したら閲覧済みにする
//
// 開封の取り方は2段構え。どちらも circular_confirmations に記録する。
//  1. 本文末尾の透明画像(1x1)が読み込まれたら opened_at … 自動。ただし画像を
//     ブロックするメールソフトでは取れないので、これだけには頼らない
//  2. 「確認しました」ボタンを押したら confirmed_at … 確実。アプリで押すのと同じ扱い
//
// リンクは HMAC 署名付きトークンで、(回覧ID・会員ID・用途)だけを含む。
// 署名がないと他人の確認を書き換えられないようにしてある。
import {
  type Env,
  type Person,
  canViewAudience,
  createSignedBlob,
  readSignedBlob,
  targetsForAudience,
} from "./core";
import { esc, mailEnabled, sendMail } from "./email";

export type MailToken = { c: number; p: number; k: "open" | "confirm" | "unsub" };

const TOKEN_TTL = 400 * 24 * 3600 * 1000; // 回覧は後から読まれることがあるので長め

function appUrl(env: Env, reqUrl: string): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  return new URL(reqUrl).origin;
}

async function link(env: Env, base: string, t: MailToken, path: string): Promise<string> {
  return `${base}${path}?t=${encodeURIComponent(await createSignedBlob(env, t, TOKEN_TTL))}`;
}

export async function readMailToken(env: Env, token: string): Promise<MailToken | null> {
  const t = await readSignedBlob<MailToken>(env, token);
  if (!t || typeof t.c !== "number" || typeof t.p !== "number") return null;
  if (t.k !== "open" && t.k !== "confirm" && t.k !== "unsub") return null;
  return t;
}

type CircularForMail = {
  id: number;
  title: string;
  body: string;
  deadline: string | null;
};

function buildHtml(
  appName: string,
  cir: CircularForMail,
  urls: { confirm: string; open: string; app: string; unsub: string },
): string {
  const body = esc(cir.body).replace(/\r?\n/g, "<br>");
  return `<!doctype html><html lang="ja"><body style="margin:0;padding:0;background:#f4f4f4;">
<div style="max-width:600px;margin:0 auto;padding:16px;font-family:'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;color:#222;font-size:16px;line-height:1.8;">
  <div style="background:#2e7d32;color:#fff;padding:12px 16px;border-radius:8px 8px 0 0;font-weight:bold;">${esc(appName)}</div>
  <div style="background:#fff;padding:16px;border-radius:0 0 8px 8px;">
    <h1 style="font-size:20px;margin:0 0 12px;">${esc(cir.title)}</h1>
    ${cir.deadline ? `<p style="margin:0 0 12px;color:#c62828;font-weight:bold;">確認期限: ${esc(cir.deadline)}</p>` : ""}
    <div style="margin:0 0 20px;">${body}</div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${urls.confirm}" style="display:inline-block;background:#2e7d32;color:#fff;text-decoration:none;font-weight:bold;font-size:18px;padding:16px 28px;border-radius:10px;">確認しました</a>
      <p style="font-size:13px;color:#666;margin:8px 0 0;">↑ 押していただくと、町会に「読みました」と伝わります</p>
    </div>

    <p style="font-size:14px;"><a href="${urls.app}" style="color:#2e7d32;">アプリで開く(画像や過去の回覧も見られます)</a></p>
    <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;">
    <p style="font-size:12px;color:#888;margin:0;">
      このメールは${esc(appName)}の会員の方にお送りしています。<br>
      メールでの回覧をやめる場合は<a href="${urls.unsub}" style="color:#888;">こちら</a>(アプリではこれまでどおりご覧いただけます)。
    </p>
  </div>
</div>
<img src="${urls.open}" width="1" height="1" alt="" style="display:block;border:0;">
</body></html>`;
}

function buildText(appName: string, cir: CircularForMail, urls: { confirm: string; app: string }) {
  return (
    `【${appName}】${cir.title}\n\n` +
    (cir.deadline ? `確認期限: ${cir.deadline}\n\n` : "") +
    `${cir.body}\n\n` +
    `── 確認したら、次のリンクを開いてください ──\n${urls.confirm}\n\n` +
    `アプリで開く: ${urls.app}\n`
  );
}

/**
 * 回覧を、閲覧できる会員のうちメール登録者へ送る。
 * 対象の絞り込みは targetsForAudience に任せる(アプリの通知と同じ範囲)。
 */
export async function sendCircularEmails(
  env: Env,
  reqUrl: string,
  cir: CircularForMail,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = { sent: 0, failed: 0, skipped: 0 };
  if (!mailEnabled(env)) return result;

  const base = appUrl(env, reqUrl);
  const targets = await targetsForAudience(env.DB, (await audienceOf(env, cir.id)) ?? "all");

  for (const t of targets as Person[]) {
    if (!t.email || t.email_optout || !t.is_digital) {
      result.skipped++;
      continue;
    }
    // 同じ回覧を二重に送らない(再公開のときは送り直したいので、送信済みなら飛ばす)
    const already = await env.DB.prepare(
      "SELECT 1 AS x FROM circular_emails WHERE circular_id=? AND person_id=? AND status='sent'",
    )
      .bind(cir.id, t.id)
      .first();
    if (already) {
      result.skipped++;
      continue;
    }

    const urls = {
      confirm: await link(env, base, { c: cir.id, p: t.id, k: "confirm" }, "/api/e/confirm"),
      open: await link(env, base, { c: cir.id, p: t.id, k: "open" }, "/api/e/open.png"),
      unsub: await link(env, base, { c: cir.id, p: t.id, k: "unsub" }, "/api/e/unsubscribe"),
      app: `${base}/app/circulars/${cir.id}`,
    };
    const r = await sendMail(
      env,
      t.email,
      `【${env.APP_NAME}】${cir.title}`,
      buildHtml(env.APP_NAME, cir, urls),
      buildText(env.APP_NAME, cir, urls),
    );
    await env.DB.prepare(
      `INSERT INTO circular_emails (circular_id, person_id, status, error) VALUES (?,?,?,?)
       ON CONFLICT(circular_id, person_id) DO UPDATE SET
         sent_at=datetime('now'), status=excluded.status, error=excluded.error`,
    )
      .bind(cir.id, t.id, r.ok ? "sent" : "failed", r.ok ? null : r.error)
      .run();
    if (r.ok) result.sent++;
    else result.failed++;
  }
  return result;
}

/**
 * 入会した人に、**そのとき公開中の回覧**をまとめて1通で送る(オーナー指示 2026-07-29)。
 *
 *   例) 回覧Aが1/1公開・1/30終了。ユーザーXが1/10に入会 → XはAを受け取る。
 *
 * 1通ずつ送ると入会直後に何通も届いてしまうため、公開中のものを1通にまとめる。
 * 回覧ごとに「確認しました」ボタンを付けるので、確認の記録は1件ずつ残る。
 * PWAの未確認一覧は `/api/circulars` が公開中のものを返すので自動的に出る。
 */
export async function sendWelcomeCirculars(
  env: Env,
  reqUrl: string,
  person: { id: number; name: string; email: string | null; roles: string[] },
): Promise<{ sent: boolean; count: number }> {
  if (!mailEnabled(env) || !person.email) return { sent: false, count: 0 };

  const rows = await env.DB.prepare(
    `SELECT id, title, deadline, audience FROM circulars
     WHERE status='published' AND visibility IN ('members','both')
     ORDER BY published_at DESC LIMIT 50`,
  ).all<{ id: number; title: string; deadline: string | null; audience: string }>();

  const user = { id: person.id, roles: person.roles } as unknown as Parameters<
    typeof canViewAudience
  >[2];
  const visible: typeof rows.results = [];
  for (const r of rows.results) {
    if (await canViewAudience(env.DB, r.audience, user)) visible.push(r);
  }
  if (!visible.length) return { sent: false, count: 0 };

  const base = appUrl(env, reqUrl);
  const items: string[] = [];
  const textItems: string[] = [];
  for (const r of visible) {
    const confirm = await link(env, base, { c: r.id, p: person.id, k: "confirm" }, "/api/e/confirm");
    items.push(
      `<li style="margin:0 0 18px;">
         <div style="font-weight:bold;font-size:17px;">${esc(r.title)}</div>
         ${r.deadline ? `<div style="color:#c62828;font-size:14px;">確認期限: ${esc(r.deadline)}</div>` : ""}
         <div style="margin-top:6px;">
           <a href="${confirm}" style="display:inline-block;background:#2e7d32;color:#fff;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px;font-size:15px;">確認しました</a>
           <a href="${base}/app/circulars/${r.id}" style="color:#2e7d32;margin-left:10px;font-size:14px;">中身を見る</a>
         </div>
       </li>`,
    );
    textItems.push(
      `・${r.title}${r.deadline ? `(確認期限: ${r.deadline})` : ""}\n  確認: ${confirm}\n  中身: ${base}/app/circulars/${r.id}`,
    );
  }

  const unsub = await link(env, base, { c: 0, p: person.id, k: "unsub" }, "/api/e/unsubscribe");
  const subject = `【${env.APP_NAME}】ご登録ありがとうございます(いま回覧中のお知らせ ${visible.length}件)`;
  const html = `<!doctype html><html lang="ja"><body style="margin:0;padding:0;background:#f4f4f4;">
<div style="max-width:600px;margin:0 auto;padding:16px;font-family:'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;color:#222;font-size:16px;line-height:1.8;">
  <div style="background:#2e7d32;color:#fff;padding:12px 16px;border-radius:8px 8px 0 0;font-weight:bold;">${esc(env.APP_NAME)}</div>
  <div style="background:#fff;padding:16px;border-radius:0 0 8px 8px;">
    <h1 style="font-size:20px;margin:0 0 12px;">${esc(person.name)} さん、ご登録ありがとうございます</h1>
    <p style="margin:0 0 16px;">いま回覧中のお知らせをお送りします。お読みになったら「確認しました」を押してください。</p>
    <ul style="list-style:none;padding:0;margin:0;">${items.join("")}</ul>
    <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;">
    <p style="font-size:12px;color:#888;margin:0;">
      これから公開される回覧は、1件ずつメールでお送りします。<br>
      メールでの回覧をやめる場合は<a href="${unsub}" style="color:#888;">こちら</a>(アプリではこれまでどおりご覧いただけます)。
    </p>
  </div>
</div></body></html>`;
  const text =
    `【${env.APP_NAME}】${person.name} さん、ご登録ありがとうございます\n\n` +
    `いま回覧中のお知らせです。お読みになったら「確認」のリンクを開いてください。\n\n` +
    textItems.join("\n\n");

  const r = await sendMail(env, person.email, subject, html, text);
  // 再公開時に二重で届かないよう、送った回覧は記録しておく
  for (const cir of visible) {
    await env.DB.prepare(
      `INSERT INTO circular_emails (circular_id, person_id, status, error) VALUES (?,?,?,?)
       ON CONFLICT(circular_id, person_id) DO UPDATE SET
         sent_at=datetime('now'), status=excluded.status, error=excluded.error`,
    )
      .bind(cir.id, person.id, r.ok ? "sent" : "failed", r.ok ? null : r.error)
      .run();
  }
  return { sent: r.ok, count: visible.length };
}

async function audienceOf(env: Env, circularId: number): Promise<string | null> {
  const row = await env.DB.prepare("SELECT audience FROM circulars WHERE id=?")
    .bind(circularId)
    .first<{ audience: string }>();
  return row?.audience ?? null;
}

/** 開封または「確認しました」を記録する。アプリで押した場合と同じ表に入れる。 */
export async function recordMailConfirmation(
  env: Env,
  t: MailToken,
  kind: "open" | "confirm",
): Promise<void> {
  const col = kind === "open" ? "opened_at" : "confirmed_at";
  await env.DB.prepare(
    `INSERT INTO circular_confirmations (circular_id, person_id, ${col}, method)
     VALUES (?,?,datetime('now'),'email')
     ON CONFLICT(circular_id, person_id) DO UPDATE SET
       ${col}=COALESCE(circular_confirmations.${col}, datetime('now'))`,
  )
    .bind(t.c, t.p)
    .run();
  // 「確認しました」は開封も兼ねる
  if (kind === "confirm") {
    await env.DB.prepare(
      "UPDATE circular_confirmations SET opened_at=COALESCE(opened_at, datetime('now')) WHERE circular_id=? AND person_id=?",
    )
      .bind(t.c, t.p)
      .run();
  }
}
