// 回覧メールの中のリンク(開封画像・確認ボタン・配信停止)。
// ログイン不要。かわりに HMAC 署名付きトークンで本人と回覧を特定する。
// 署名がなければ何もしない(他人の確認状況を書き換えられないようにするため)。
import { Hono } from "hono";
import type { AppEnv } from "../core";
import { readMailToken, recordMailConfirmation } from "../circularmail";

const emailLinks = new Hono<AppEnv>();

// 1x1の透明PNG(base64)。メールソフトが画像を読み込んだら「開封」とみなす。
const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
  (ch) => ch.charCodeAt(0),
);

function pixelResponse() {
  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/png",
      // 毎回サーバに来てほしいのでキャッシュさせない
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

// 開封トラッキング。失敗しても必ず画像を返す(メールの見た目を壊さない)。
emailLinks.get("/open.png", async (c) => {
  const t = await readMailToken(c.env, c.req.query("t") || "");
  if (t && t.k === "open") {
    try {
      await recordMailConfirmation(c.env, t, "open");
    } catch {
      // 記録に失敗しても画像は返す
    }
  }
  return pixelResponse();
});

function page(title: string, message: string, appName: string, extra = ""): Response {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#f4f4f4;font-family:'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:24px 16px;">
  <div style="background:#fff;border-radius:12px;padding:28px 20px;text-align:center;">
    <div style="font-size:56px;line-height:1;">${title.startsWith("確認") ? "✅" : "📪"}</div>
    <h1 style="font-size:22px;margin:14px 0 8px;color:#222;">${title}</h1>
    <p style="font-size:16px;line-height:1.8;color:#444;margin:0;">${message}</p>
    ${extra}
    <p style="margin:24px 0 0;"><a href="/" style="display:inline-block;background:#2e7d32;color:#fff;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:10px;">${appName}を開く</a></p>
  </div>
</div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// 「確認しました」ボタン。アプリで押したのと同じ扱いにする。
emailLinks.get("/confirm", async (c) => {
  const t = await readMailToken(c.env, c.req.query("t") || "");
  if (!t || t.k !== "confirm") {
    return page("リンクが正しくありません", "お手数ですが、アプリを開いて確認をお願いします。", c.env.APP_NAME);
  }
  await recordMailConfirmation(c.env, t, "confirm");
  return page("確認しました", "ありがとうございます。町会に伝わりました。", c.env.APP_NAME);
});

// メールでの回覧配信を止める。アプリでの閲覧はこれまでどおり。
emailLinks.get("/unsubscribe", async (c) => {
  const t = await readMailToken(c.env, c.req.query("t") || "");
  if (!t || t.k !== "unsub") {
    return page("リンクが正しくありません", "お手数ですが、アプリの設定から変更をお願いします。", c.env.APP_NAME);
  }
  await c.env.DB.prepare("UPDATE persons SET email_optout=1 WHERE id=?").bind(t.p).run();
  return page(
    "メールの配信を止めました",
    "これから回覧はメールでお送りしません。アプリではこれまでどおりご覧いただけます。",
    c.env.APP_NAME,
    `<p style="font-size:14px;color:#666;margin:12px 0 0;">やっぱり受け取りたい場合は、アプリの「ログイン方法」からメール配信を再開できます。</p>`,
  );
});

export default emailLinks;
