// 役割の判定で、サーバとクライアントの両方が使うもの。
// ⚠ 判定を二重に書くとズレるので、ここに1本化する。

/** 会館予約者(貸館の外部利用者) */
export const HALL_USER_ROLE = "hall_user";

/**
 * 役割が「会館予約者」だけ = 町会の外の人か。
 * true の人には回覧・資料・会合を見せない(サーバ側でも同じ判定で弾いている)。
 */
export function isHallUserOnly(roles: string[]): boolean {
  return roles.length > 0 && roles.every((r) => r === HALL_USER_ROLE);
}
