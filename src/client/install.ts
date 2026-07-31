// ホーム画面への追加。
// Android/Chromeは beforeinstallprompt を横取りして「1回押すだけ」のボタンにできる(オーナー指示)。
// iOSは同等のAPIが無いため、共有ボタンからの手順を案内するしかない(push.ts の need_install)。
//
// 注意: beforeinstallprompt はページ読み込み直後に飛んでくることがあるため、
// Reactの描画を待たず main.tsx の最初で捕まえる必要がある。

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

function notify() {
  for (const fn of listeners) fn(deferred !== null);
}

/** main.tsx から一度だけ呼ぶ。 */
export function initInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // 既定のミニバーを抑えて、こちらのボタンで出す
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function canInstall(): boolean {
  return deferred !== null;
}

/** 表示中のボタンを出し分けるための購読。戻り値で解除する。 */
export function onInstallAvailable(fn: (available: boolean) => void): () => void {
  listeners.add(fn);
  fn(deferred !== null);
  return () => listeners.delete(fn);
}

/** 実際に確認のダイアログを出す。true=追加された。 */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null; // promptは1回しか使えない
  notify();
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return choice.outcome === "accepted";
  } catch {
    return false;
  }
}
