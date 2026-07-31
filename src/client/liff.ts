// LIFF(LINEミニアプリ)連携: SDKを動的読込し、IDトークンを取得してサーバーで検証する
declare global {
  interface Window {
    liff?: {
      init(config: { liffId: string }): Promise<void>;
      isLoggedIn(): boolean;
      login(opts?: { redirectUri?: string }): void;
      getIDToken(): string | null;
      getProfile(): Promise<{ displayName?: string }>;
    };
  }
}

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.liff) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("LIFF SDKの読み込みに失敗しました"));
      document.head.appendChild(s);
    });
  }
  return sdkPromise;
}

// 戻り値null = LINEログイン画面へ遷移中(このページは離れる)
export async function liffGetIdToken(
  liffId: string,
): Promise<{ idToken: string; displayName?: string } | null> {
  await loadSdk();
  const liff = window.liff!;
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return null;
  }
  const idToken = liff.getIDToken();
  if (!idToken) {
    liff.login({ redirectUri: window.location.href });
    return null;
  }
  let displayName: string | undefined;
  try {
    displayName = (await liff.getProfile())?.displayName;
  } catch {
    // プロフィール取得失敗時は名前なしで続行
  }
  return { idToken, displayName };
}
