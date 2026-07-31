// 会館予約のくりかえし(オーナー指示 2026-07-29: 2ヶ月先まで・毎週/隔週などの便利モード)。
// **サーバとクライアントで同じ日付が出ないと混乱する**ため、計算はここに1本化して両方から使う。
export const REPEAT_MODES = ["weekly", "biweekly", "monthly"] as const;
export type RepeatMode = (typeof REPEAT_MODES)[number];

export const REPEAT_MAX_MONTHS = 2;
const REPEAT_MAX_COUNT = 12; // 毎週×2ヶ月でも9回程度。暴走防止の上限

export const REPEAT_CHOICES: {
  key: "none" | RepeatMode;
  label: string;
  note?: string;
}[] = [
  { key: "none", label: "くりかえさない(この日だけ)" },
  { key: "weekly", label: "毎週", note: "同じ曜日・同じ時間" },
  { key: "biweekly", label: "隔週", note: "1週間おき" },
  { key: "monthly", label: "毎月", note: "第2火曜など、月の同じ週の同じ曜日" },
];

/** 日付文字列(YYYY-MM-DD)をUTC正午のDateにする(タイムゾーンで前後にずれないように) */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * くりかえしの日付を並べる。1件目は開始日そのもの。開始日から2ヶ月先まで。
 *   weekly   = 7日ごと
 *   biweekly = 14日ごと
 *   monthly  = 「第N◯曜日」を保つ(例: 第2火曜)。第5◯曜日が無い月は飛ばす
 */
export function repeatDates(startDate: string, mode: RepeatMode): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return [];
  const start = parseDate(startDate);
  const limit = parseDate(startDate);
  limit.setUTCMonth(limit.getUTCMonth() + REPEAT_MAX_MONTHS);

  const out: string[] = [];
  if (mode === "monthly") {
    const weekday = start.getUTCDay();
    const nth = Math.floor((start.getUTCDate() - 1) / 7); // 0始まり
    for (let i = 0; i < REPEAT_MAX_COUNT; i++) {
      const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1, 12));
      const shift = (weekday - first.getUTCDay() + 7) % 7;
      const day = new Date(first);
      day.setUTCDate(1 + shift + nth * 7);
      if (day.getUTCMonth() !== first.getUTCMonth()) continue;
      if (day < start) continue;
      if (day > limit) break;
      out.push(toIso(day));
    }
    return out;
  }
  const step = mode === "weekly" ? 7 : 14;
  for (let i = 0; i < REPEAT_MAX_COUNT; i++) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + step * i);
    if (day > limit) break;
    out.push(toIso(day));
  }
  return out;
}
