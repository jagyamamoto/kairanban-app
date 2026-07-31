// LINE公式アカウントのWebhook(友だち追加・メッセージへの自動応答。応答メッセージは無料)
import { Hono } from "hono";
import type { AppEnv, Env } from "../core";

const line = new Hono<AppEnv>();

const enc = new TextEncoder();

async function verifySignature(secret: string, body: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

function appUrl(env: Env, origin: string): string {
  return env.LIFF_ID ? `https://liff.line.me/${env.LIFF_ID}` : `${origin}/app`;
}

line.post("/webhook", async (c) => {
  if (!c.env.LINE_CHANNEL_SECRET) return c.json({ ok: true });
  const bodyText = await c.req.text();
  const sig = c.req.header("x-line-signature") || "";
  if (!(await verifySignature(c.env.LINE_CHANNEL_SECRET, bodyText, sig))) {
    return c.text("bad signature", 403);
  }
  const payload = JSON.parse(bodyText) as {
    events?: { type: string; replyToken?: string; message?: { type: string } }[];
  };
  const origin = new URL(c.req.url).origin;
  for (const ev of payload.events ?? []) {
    if (!ev.replyToken || !c.env.LINE_CHANNEL_ACCESS_TOKEN) continue;
    let text: string | null = null;
    if (ev.type === "follow") {
      text =
        `友だち追加ありがとうございます。\n` +
        `${c.env.APP_NAME}の回覧・会館予約はこちらのアプリから:\n` +
        appUrl(c.env, origin);
    } else if (ev.type === "message" && ev.message?.type === "text") {
      text =
        `このアカウントは通知専用です。\n` +
        `回覧の確認・会館予約はアプリからお願いします:\n` +
        appUrl(c.env, origin);
    }
    if (text) {
      await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${c.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          replyToken: ev.replyToken,
          messages: [{ type: "text", text }],
        }),
      });
    }
  }
  return c.json({ ok: true });
});

export default line;
