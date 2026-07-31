// 電子メールの送信(Resend)。
//
// 用途は回覧の配信のみ。Cloudflare Workers からは SMTP が使えないため HTTP API を使う。
// RESEND_API_KEY が未設定なら送信をスキップする(設定するまでアプリは通常どおり動く)。
//
// ⚠ 送信元(MAIL_FROM)のドメインは Resend で認証済みである必要がある。
//   未認証のドメインから送るとResendが400を返す。設定手順は HANDOFF.md を参照。
import type { Env } from "./core";

const ENDPOINT = "https://api.resend.com/emails";

export function mailEnabled(env: Env): boolean {
  return !!(env.RESEND_API_KEY && env.MAIL_FROM);
}

export type MailResult = { ok: true } | { ok: false; error: string };

export async function sendMail(
  env: Env,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<MailResult> {
  if (!mailEnabled(env)) return { ok: false, error: "メール送信が未設定です" };
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [to],
        subject,
        html,
        text,
        // 会員向けの連絡なので、返信は町会の窓口へ届くようにする
        ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      // 本文にメールアドレスが混ざることがあるので長さを切って記録する
      console.error("mail send failed", res.status, body.slice(0, 300));
      return { ok: false, error: `${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("mail send error", e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

/** メール本文に埋め込む文字列をHTMLとして安全にする */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
