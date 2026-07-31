// Web Push送信(VAPID・ペイロードなし方式)
// ペイロードを暗号化せず「新着あり」の合図だけを送り、Service Workerが定型文を表示する。
// 通知の優先順: Web Push(無料・無制限) → LINE(無料枠 月200通) の順で1人1通。
import { type Env, jstMonth, pushLine } from "./core";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedKey: CryptoKey | null = null;
async function signingKey(env: Env): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = await crypto.subtle.importKey(
      "pkcs8",
      b64urlDecode(env.VAPID_PRIVATE_KEY!),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  }
  return cachedKey;
}

async function vapidJwt(env: Env, audience: string): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: env.VAPID_SUBJECT || "mailto:example@example.com",
      }),
    ),
  );
  const data = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await signingKey(env),
    enc.encode(data),
  );
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

// 戻り値: HTTPステータス(0=未設定・送信失敗)
export async function sendWebPush(env: Env, endpoint: string): Promise<number> {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return 0;
  try {
    const url = new URL(endpoint);
    const jwt = await vapidJwt(env, `${url.protocol}//${url.host}`);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        TTL: "86400",
        Urgency: "normal",
        Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      },
    });
    return res.status;
  } catch {
    return 0;
  }
}

// 1人へ通知: Web Push優先(無料)、なければLINE(無料枠消費)
export async function notifyPerson(
  env: Env,
  db: D1Database,
  person: { id: number; line_user_id: string | null },
  text: string,
  kind: string,
): Promise<string> {
  const subs = await db
    .prepare("SELECT id, endpoint FROM push_subscriptions WHERE person_id=?")
    .bind(person.id)
    .all<{ id: number; endpoint: string }>();
  let pushed = false;
  for (const s of subs.results) {
    const status = await sendWebPush(env, s.endpoint);
    if (status === 404 || status === 410) {
      // 無効になった購読は削除
      await db.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(s.id).run();
    } else if (status >= 200 && status < 300) {
      pushed = true;
    }
  }
  if (pushed) {
    await db
      .prepare("INSERT INTO notification_log (month, to_person, kind, status) VALUES (?,?,?,?)")
      .bind(jstMonth(), person.id, kind, "sent_push")
      .run();
    return "sent_push";
  }
  if (person.line_user_id) {
    return pushLine(env, db, person.id, person.line_user_id, text, kind);
  }
  await db
    .prepare("INSERT INTO notification_log (month, to_person, kind, status) VALUES (?,?,?,?)")
    .bind(jstMonth(), person.id, kind, "skipped_nochannel")
    .run();
  return "skipped_nochannel";
}
