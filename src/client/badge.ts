// ホーム画面のアイコンに出す未読の数(オーナー指示 2026-07-30)。
//
// 数えているのは「まだ『確認しました』を押していない、いま公開中の回覧」。
// 掲載終了日を過ぎた回覧は cron が archived にするので、**期間が過ぎれば数は自然に減る**。
//
// ⚠ この機能が使えるのは「ホーム画面のアイコンから開いたとき」だけ。
//   ふつうのブラウザのタブでは何も起きない(それが仕様)。
//   iOSは16.4以降、Androidは追加済みのときに出る。
//   使えない端末では黙って何もしない(エラーを見せない)。

type BadgeNav = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function badgeSupported(): boolean {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator;
}

/** 数を直接指定して塗る。0を渡すとバッジを消す。 */
export async function setBadge(count: number): Promise<void> {
  const nav = navigator as BadgeNav;
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    // 未対応の端末・権限が無い場合。利用者には何も見せない
  }
}

/** サーバに未読の数を聞いてバッジを塗り直す。ログインしていなければ消す。 */
export async function refreshBadge(): Promise<void> {
  if (!badgeSupported()) return;
  try {
    const res = await fetch("/api/me/badge", { credentials: "include", cache: "no-store" });
    if (!res.ok) {
      await setBadge(0); // ログインが切れている等。数字を残さない
      return;
    }
    const d = (await res.json()) as { count?: number };
    await setBadge(Number(d.count) || 0);
  } catch {
    // 通信できないときは前の数を残す(勝手に消さない)
  }
}

/**
 * 起動時に一度塗り、画面に戻ってくるたびに塗り直す。
 * 回覧を確認して数が減ったのに、アイコンに古い数が残るのを防ぐ。
 */
export function startBadgeSync(): void {
  if (!badgeSupported()) return;
  void refreshBadge();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshBadge();
  });
}
