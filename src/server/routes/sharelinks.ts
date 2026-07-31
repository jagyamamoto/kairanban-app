// 共有リンクで資料を開く画面(ログイン不要・パスワード必須)。
// LINEオープンチャットなどに貼られたURLを、アプリを入れていない人が開く前提なので
// SPAではなくサーバ側でHTMLを組み立てる(どのブラウザでも確実に表示できる)。
import { Hono } from "hono";
import {
  type AppEnv,
  HttpError,
  audit,
  createSignedBlob,
  isRateLimited,
  readSignedBlob,
  recordAttempt,
} from "../core";
import { contentTypeWithCharset, verifyPassword } from "../share";

type Share = {
  id: number;
  document_id: number;
  token: string;
  pw_salt: string;
  pw_hash: string;
  label: string | null;
  expires_at: string;
  revoked_at: string | null;
};

const shareLinks = new Hono<AppEnv>();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function page(appName: string, inner: string, title: string, status = 200): Response {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<style>
 body{margin:0;background:#f4f4f4;font-family:'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;color:#222}
 .wrap{max-width:480px;margin:0 auto;padding:24px 16px}
 .card{background:#fff;border-radius:12px;padding:24px 20px}
 h1{font-size:20px;margin:0 0 4px}
 p{font-size:15px;line-height:1.8;margin:8px 0}
 .muted{color:#666;font-size:13px}
 label{display:block;font-weight:700;margin:18px 0 6px;font-size:15px}
 input{width:100%;box-sizing:border-box;padding:14px;font-size:18px;border:2px solid #ccc;border-radius:10px}
 button{width:100%;margin-top:16px;padding:16px;font-size:18px;font-weight:700;color:#fff;background:#2e7d32;border:none;border-radius:10px;cursor:pointer}
 .err{color:#c62828;font-weight:700}
 .head{background:#2e7d32;color:#fff;padding:12px 16px;border-radius:8px 8px 0 0;font-weight:700}
 .card{border-radius:0 0 8px 8px}
</style></head><body><div class="wrap">
<div class="head">${esc(appName)}</div>
<div class="card">${inner}</div>
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });
}

async function loadShare(c: { env: AppEnv["Bindings"] }, token: string): Promise<Share | null> {
  const s = await c.env.DB.prepare("SELECT * FROM document_shares WHERE token=?")
    .bind(token)
    .first<Share>();
  if (!s || s.revoked_at) return null;
  if (s.expires_at < new Date().toISOString().slice(0, 10)) return null;
  return s;
}

function form(appName: string, title: string, token: string, error?: string): Response {
  return page(
    appName,
    `<h1>${esc(title)}</h1>
     <p class="muted">この資料はパスワードで保護されています。共有された合言葉を入力してください。</p>
     ${error ? `<p class="err">${esc(error)}</p>` : ""}
     <form method="POST" action="/s/${encodeURIComponent(token)}">
       <label for="pw">パスワード</label>
       <input id="pw" name="password" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" required>
       <button type="submit">資料を開く</button>
     </form>`,
    title,
  );
}

function gone(appName: string, message: string): Response {
  return page(
    appName,
    `<h1>この共有リンクは使えません</h1><p>${esc(message)}</p>
     <p class="muted">お手数ですが、共有された方にご連絡ください。</p>`,
    "共有リンク",
    403,
  );
}

// パスワード入力画面
shareLinks.get("/:token", async (c) => {
  const token = c.req.param("token");
  const s = await loadShare(c, token);
  if (!s) return gone(c.env.APP_NAME, "期限が切れたか、共有が取り消されています。");
  const doc = await c.env.DB.prepare("SELECT title FROM documents WHERE id=?")
    .bind(s.document_id)
    .first<{ title: string }>();
  return form(c.env.APP_NAME, doc?.title || "資料", token);
});

// パスワード照合 → 短命の署名付きURLへ送る
shareLinks.post("/:token", async (c) => {
  const token = c.req.param("token");
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  // 総当たり対策。共有リンクは誰でも叩けるので必ずかける。
  if (await isRateLimited(c.env.DB, "share", ip, 10)) {
    return gone(c.env.APP_NAME, "試行回数が多すぎます。しばらくしてからお試しください。");
  }
  const s = await loadShare(c, token);
  if (!s) return gone(c.env.APP_NAME, "期限が切れたか、共有が取り消されています。");
  const doc = await c.env.DB.prepare("SELECT title FROM documents WHERE id=?")
    .bind(s.document_id)
    .first<{ title: string }>();

  const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const password = typeof body.password === "string" ? body.password : "";
  if (!(await verifyPassword(password, s.pw_salt, s.pw_hash))) {
    await recordAttempt(c.env.DB, "share", ip);
    return form(c.env.APP_NAME, doc?.title || "資料", token, "パスワードが違います。");
  }

  await c.env.DB.prepare(
    "UPDATE document_shares SET view_count=view_count+1, last_view_at=datetime('now') WHERE id=?",
  )
    .bind(s.id)
    .run();
  await audit(c.env.DB, null, "document.share_open", "document", s.document_id, { share: s.id });

  // 10分だけ有効なワンタイムURLに載せ替える(パスワード付きURLを共有させないため)
  const t = await createSignedBlob(c.env, { share: s.id, doc: s.document_id }, 10 * 60 * 1000);
  return c.redirect(`/s/${encodeURIComponent(token)}/file?t=${encodeURIComponent(t)}`, 303);
});

// ファイル本体。上のトークンが無ければ渡さない。
shareLinks.get("/:token/file", async (c) => {
  const payload = await readSignedBlob<{ share: number; doc: number }>(
    c.env,
    c.req.query("t") || "",
  );
  if (!payload) return gone(c.env.APP_NAME, "表示の有効期限が切れました。もう一度お試しください。");
  // 署名が有効でも、その後に失効・期限切れになっていたら渡さない
  const s = await loadShare(c, c.req.param("token"));
  if (!s || s.id !== payload.share) {
    return gone(c.env.APP_NAME, "期限が切れたか、共有が取り消されています。");
  }
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id=?")
    .bind(payload.doc)
    .first<{ file_key: string | null; file_name: string | null; file_type: string | null }>();
  if (!doc || !doc.file_key) throw new HttpError(404, "ファイルが見つかりません");
  const obj = await c.env.IMAGES.get(doc.file_key);
  if (!obj) throw new HttpError(404, "ファイルが見つかりません");
  const name = encodeURIComponent(doc.file_name || "document");
  return new Response(obj.body, {
    headers: {
      "Content-Type": contentTypeWithCharset(doc.file_type),
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${name}`,
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
});

export default shareLinks;
