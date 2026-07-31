// Web Push購読(PWA利用者の無料通知)
import { api } from "./api";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushState = "unsupported" | "need_install" | "denied" | "subscribed" | "off";

// iOSのSafariはホーム画面に追加(standalone)しないとWeb Push不可
function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function getPushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "need_install" : "unsupported";
  }
  if (isIos() && !isStandalone()) return "need_install";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? "subscribed" : "off";
  } catch {
    return "unsupported";
  }
}

export async function subscribePush(vapidPublicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("通知が許可されませんでした");
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
  });
  await api("/api/push/subscribe", { body: sub.toJSON() });
}

export async function unsubscribePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api("/api/push/unsubscribe", { body: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
  }
}
