// Googleログイン(Google Identity Services)。
// スクリプトは必要になったときだけ読み込む(使わない人に余計な通信をさせない)。
// 受け取ったIDトークンはサーバで検証する。クライアント側の値は一切信用しない。
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: {
            client_id: string;
            callback: (r: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let loading: Promise<void> | null = null;

export function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Googleログインを読み込めませんでした"));
    document.head.appendChild(s);
  });
  return loading;
}

/** ボタンを描画する。押されると onCredential にIDトークンが渡る。 */
export async function renderGoogleButton(
  el: HTMLElement,
  clientId: string,
  onCredential: (credential: string) => void,
): Promise<void> {
  await loadGoogleScript();
  const g = window.google;
  if (!g) throw new Error("Googleログインを読み込めませんでした");
  g.accounts.id.initialize({
    client_id: clientId,
    callback: (r) => onCredential(r.credential),
  });
  el.innerHTML = "";
  g.accounts.id.renderButton(el, {
    theme: "outline",
    size: "large",
    width: 300,
    text: "signin_with",
    locale: "ja",
  });
}
