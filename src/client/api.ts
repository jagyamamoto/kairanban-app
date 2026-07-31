// APIクライアント(同一オリジン・Cookieセッション)
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  opts?: { method?: string; body?: unknown },
): Promise<T> {
  const method = opts?.method ?? (opts?.body !== undefined ? "POST" : "GET");
  const res = await fetch(path, {
    method,
    headers: opts?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  if (!res.ok) {
    let message = `エラーが発生しました (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // JSONでないエラー応答はそのまま
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

// 画像アップロード(multipart/form-data)。JSONを使うapi()とは別経路。
export async function apiUpload<T = unknown>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(path, { method: "POST", body: form, credentials: "same-origin" });
  if (!res.ok) {
    let message = `エラーが発生しました (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // JSONでないエラー応答はそのまま
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export type Me = {
  user: {
    id: number;
    name: string;
    kana: string | null;
    lang: string;
    status: string;
    roles: string[];
    is_digital: number;
    has_line: boolean;
    hall_early_access: boolean;
    email: string | null;
    email_optout: boolean;
    address: string | null;
    household_head: string | null;
    phone: string | null;
    /** ホーム画面に追加済みか(サーバ記録)。iOSはSafariとホーム画面アプリで保存領域が別なため */
    pwa_installed?: boolean;
  } | null;
  config: {
    appName: string;
    liffId: string | null;
    devMode: boolean;
    vapidPublicKey: string | null;
    googleClientId: string | null;
    lineLoginEnabled: boolean;
    mailEnabled: boolean;
  };
};
