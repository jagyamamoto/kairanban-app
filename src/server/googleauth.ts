// Googleログイン(Google Identity Services のIDトークン検証)。
// クライアントで受け取ったIDトークン(JWT)を、Googleの公開鍵で**サーバ側で検証**する。
// 検証を省いてメールアドレスだけ信じると、誰でも他人になりすませるので必ず全項目を確認すること。
import type { Env } from "./core";

const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const VALID_ISS = ["accounts.google.com", "https://accounts.google.com"];

type Jwk = { kid: string; kty: string; alg: string; n: string; e: string; use?: string };

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function b64urlToJson(s: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

// 鍵は数時間キャッシュされる。Workerのグローバルに持っておく(インスタンス内のみ)。
let cachedKeys: { keys: Jwk[]; fetchedAt: number } | null = null;

async function getKeys(): Promise<Jwk[]> {
  const now = Date.now();
  if (cachedKeys && now - cachedKeys.fetchedAt < 60 * 60 * 1000) return cachedKeys.keys;
  const res = await fetch(GOOGLE_CERTS, { cf: { cacheTtl: 3600 } });
  if (!res.ok) throw new Error("google certs fetch failed");
  const data = (await res.json()) as { keys: Jwk[] };
  cachedKeys = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

export type GoogleIdentity = { email: string; name: string | null; sub: string };

/** IDトークンを検証し、確認済みメールアドレスを返す。失敗したら null。 */
export async function verifyGoogleIdToken(
  env: Env,
  idToken: string,
): Promise<GoogleIdentity | null> {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) return null; // 未設定なら使わせない

  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = b64urlToJson(h);
    payload = b64urlToJson(p);
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null; // algの取り違え(alg=none等)を防ぐ

  // 署名検証
  try {
    const keys = await getKeys();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(sig),
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!ok) return null;
  } catch {
    return null;
  }

  // 中身の検証(ここを省くと別サイト向けのトークンを使い回されうる)
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < nowSec) return null;
  if (typeof payload.iat === "number" && payload.iat > nowSec + 300) return null; // 未来すぎる
  if (typeof payload.iss !== "string" || !VALID_ISS.includes(payload.iss)) return null;
  if (payload.aud !== clientId) return null; // このアプリ宛のトークンか
  if (payload.email_verified !== true && payload.email_verified !== "true") return null;
  const email = typeof payload.email === "string" ? payload.email.toLowerCase().trim() : "";
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!email || !sub) return null;

  return { email, name: typeof payload.name === "string" ? payload.name : null, sub };
}
