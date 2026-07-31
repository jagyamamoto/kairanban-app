// 日時表示(DBはUTC保存 → 日本時間で表示)
export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "";
  // D1は "YYYY-MM-DD HH:MM:SS"(UTC)、取り込み系はISO8601("...Z")で入る。両方受ける。
  const iso = /[TZ]|[+-]\d{2}:\d{2}$/.test(s) ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}/${j.getUTCMonth() + 1}/${j.getUTCDate()} ${String(
    j.getUTCHours(),
  ).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
}

// 日付のみの文字列("2026-08-10")の整形(タイムゾーン変換なし)
export function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[1]}/${Number(m[2])}/${Number(m[3])}`;
}

export function todayStr(): string {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(
    j.getUTCDate(),
  ).padStart(2, "0")}`;
}
