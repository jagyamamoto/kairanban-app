// 資料の共有リンク(URL+パスワード)。LINEオープンチャットなどに貼る想定(オーナー依頼)。
//
// ⚠ これは資料の level(役員のみ/会員/公開)を**意図的に迂回する**仕組み。
//   リンクとパスワードを知っている人は、会員でなくても中身を開ける。
//   そのため次の条件を必ず守ること:
//     ・パスワード必須(平文は保存しない。PBKDF2-SHA256 のハッシュのみ)
//     ・有効期限必須(既定30日・最長180日)
//     ・作成できるのは資料管理者だけ
//     ・総当たり対策としてIP単位のレート制限をかける
//     ・作成/失効/閲覧はすべて監査ログに残す
const enc = new TextEncoder();

const PBKDF2_ITERATIONS = 120_000;

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

/** URLに載せる推測不能なトークン(24バイト=192bit) */
export function newShareToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(24)));
}

/** 人が読み上げ・転記しやすいパスワードを作る(紛らわしい文字を除く) */
export function suggestPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // l,o,0,1 を除く
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return b64url(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64url(salt), hash: await derive(password, salt) };
}

/** 一致判定。長さ・内容の差で時間が変わらないよう定数時間で比べる。 */
export async function verifyPassword(
  password: string,
  salt: string,
  expected: string,
): Promise<boolean> {
  let actual: string;
  try {
    actual = await derive(password, fromB64url(salt));
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** text/* にcharsetが無いとブラウザが別の文字コードで解釈して文字化けするので補う */
export function contentTypeWithCharset(t: string | null): string {
  const type = t || "application/octet-stream";
  if (type.startsWith("text/") && !type.includes("charset")) return `${type}; charset=utf-8`;
  return type;
}
