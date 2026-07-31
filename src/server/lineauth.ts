// LINEログイン(ウェブ版・OAuth2/OIDC)。LIFF/ミニアプリは使わない。
// 目的は「本人確認の手段を増やす」ことだけで、LINEアプリへ遷移させたり
// LINE内で動かしたりはしない(オーナー方針)。
//
// ⚠ LINEログインから取得できるのは「LINEのユーザーID(sub)」と、
//   申請が通れば「メールアドレス」まで。**電話番号は取得できない**
//   (電話番号は法人向けの LINE Profile+ が必要で、通常のLINEログインでは不可)。
//   そのため電話番号は従来どおりフォームに入力してもらう。
import { type Env, HttpError } from "./core";

const AUTHORIZE = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN = "https://api.line.me/oauth2/v2.1/token";
const VERIFY = "https://api.line.me/oauth2/v2.1/verify";

export function lineRedirectUri(reqUrl: string): string {
  const u = new URL(reqUrl);
  return `${u.origin}/api/auth/line/callback`;
}

/** 認可画面のURLを組み立てる。stateはCSRF対策(呼び出し側でCookieに保存する)。 */
export function buildLineAuthUrl(env: Env, reqUrl: string, state: string): string {
  if (!env.LINE_LOGIN_CHANNEL_ID) throw new HttpError(500, "LINEログインが未設定です");
  // email スコープは「メールアドレス取得権限」の申請が通るまで要求してはいけない。
  // 未申請のまま要求すると認可画面自体がエラーになりログインできなくなる。
  // 申請が通ったら Cloudflare の変数 LINE_EMAIL_SCOPE=1 を入れるだけで有効になる。
  const scope = env.LINE_EMAIL_SCOPE === "1" ? "openid profile email" : "openid profile";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.LINE_LOGIN_CHANNEL_ID,
    redirect_uri: lineRedirectUri(reqUrl),
    state,
    scope,
  });
  return `${AUTHORIZE}?${params.toString()}`;
}

export type LineIdentity = { sub: string; name: string | null; email: string | null };

/** 認可コードをトークンに交換し、IDトークンをLINEのAPIで検証して本人情報を返す。 */
export async function exchangeLineCode(
  env: Env,
  reqUrl: string,
  code: string,
): Promise<LineIdentity> {
  if (!env.LINE_LOGIN_CHANNEL_ID || !env.LINE_LOGIN_CHANNEL_SECRET) {
    throw new HttpError(500, "LINEログインが未設定です");
  }
  const tokenRes = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: lineRedirectUri(reqUrl),
      client_id: env.LINE_LOGIN_CHANNEL_ID,
      client_secret: env.LINE_LOGIN_CHANNEL_SECRET,
    }),
  });
  if (!tokenRes.ok) throw new HttpError(401, "LINEログインに失敗しました");
  const tok = (await tokenRes.json()) as { id_token?: string };
  if (!tok.id_token) throw new HttpError(401, "LINEログインに失敗しました");

  // IDトークンはLINEの検証APIに通す(署名・発行元・宛先をLINE側で確認してもらう)
  const verifyRes = await fetch(VERIFY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: tok.id_token,
      client_id: env.LINE_LOGIN_CHANNEL_ID,
    }),
  });
  if (!verifyRes.ok) throw new HttpError(401, "LINEログインの検証に失敗しました");
  const v = (await verifyRes.json()) as {
    sub?: string;
    name?: string;
    email?: string;
    aud?: string;
  };
  if (!v.sub || v.aud !== env.LINE_LOGIN_CHANNEL_ID) {
    throw new HttpError(401, "LINEログインの検証に失敗しました");
  }
  return {
    sub: v.sub,
    name: v.name ?? null,
    email: v.email ? v.email.toLowerCase().trim() : null,
  };
}
