// 会員情報の「不足」判定(オーナー指示 2026-07-30)。
// 役員が代わりに入力すると「名が抜けている」「メールが無い」ことが起きるため、
// 不足を本人にも管理者にも赤く見せ、月に1度は本人へお知らせする。
// ⚠ サーバとクライアントで判定がズレると「赤いのに直せない」ことになるので、ここに1本化する。

export type ProfileLike = {
  name: string;
  address: string | null;
  household_head: string | null;
  email: string | null;
  phone: string | null;
  roles?: string[];
};

export type MissingField = "given_name" | "address" | "email" | "phone" | "household_head";

export const MISSING_LABELS: Record<MissingField, string> = {
  given_name: "お名前(名)",
  address: "住所(七丁目より後ろ)",
  email: "メールアドレス",
  phone: "電話番号",
  household_head: "世帯主(代表者)のお名前",
};

/** 直してほしい項目を返す。空配列なら不足なし。 */
export function missingFields(p: ProfileLike): MissingField[] {
  const out: MissingField[] = [];
  // 「名」が抜けている疑い。空白で姓名が分かれていれば十分とみなす。
  // 空白が無い場合は**3文字以下のときだけ**不足とする(「佐藤」=姓のみ を拾い、
  // 「山田はなこ」のように続けて書かれた氏名を誤って不足にしないため)。
  const nm = (p.name || "").trim();
  if (!nm || (!/\S\s+\S/.test(nm) && [...nm].length <= 3)) out.push("given_name");
  if (!p.phone) out.push("phone");
  if (!p.email) out.push("email");
  // 会館予約者(貸館の外部利用者)には町会の住所・世帯主は聞かない
  const hallOnly = (p.roles ?? []).length > 0 && (p.roles ?? []).every((r) => r === "hall_user");
  if (!hallOnly) {
    if (!p.address) out.push("address");
    if (!p.household_head) out.push("household_head");
  }
  return out;
}
