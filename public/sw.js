// Service Worker: 低速回線・オフラインでも直近の公開情報を表示できるようにする
const CACHE = "kairanban-v4";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Web Push受信。
// 本文は通知に載せず、受け取ってからサーバに聞いて組み立てる(オーナー指示 2026-07-30)。
// 「(お名前)さん、「(回覧の見出し)」の回覧通知があります。」のように出す。
//
// ⚠ 聞けなかった(電波が弱い・ログインが切れた等)ときは、必ず定型文で通知を出す。
//   通知を1つも出さないと、iOSは購読を止めてしまうことがある。
self.addEventListener("push", (e) => {
  e.waitUntil(
    (async () => {
      let title = "みどり町三丁目町会";
      let body = "新しいお知らせがあります。開いてご確認ください。";
      try {
        const res = await fetch("/api/me/notice-text", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const d = await res.json();
          if (d && d.body) {
            title = d.title || title;
            body = d.body;
          }
          // ホーム画面のアイコンに未読の数を出す。
          // 掲載終了日を過ぎた回覧は数に入らないので、期間が過ぎれば数は減る。
          if (typeof d.count === "number" && self.navigator.setAppBadge) {
            try {
              if (d.count > 0) await self.navigator.setAppBadge(d.count);
              else await self.navigator.clearAppBadge();
            } catch (e) {
              // 未対応の端末では何もしない
            }
          }
        }
      } catch (err) {
        // 定型文のまま出す
      }
      await self.registration.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "kairanban-notice",
        data: { url: "/app" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate("/app");
          return c.focus();
        }
      }
      return clients.openWindow("/app");
    }),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 公開APIはネット優先・失敗時はキャッシュ(オフライン閲覧用)
  if (url.pathname.startsWith("/api/public/")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || Response.error())),
    );
    return;
  }
  // その他のAPIはキャッシュしない(個人情報のため)
  if (url.pathname.startsWith("/api/")) return;

  // 資料の共有リンク(/s/...)はサーバがHTMLやファイルを直接返す。
  // ここでキャッシュした「/」を返してしまうとアプリのトップが開いてしまうので、
  // Service Worker は一切さわらずネットワークにそのまま任せる。
  if (url.pathname === "/s" || url.pathname.startsWith("/s/")) return;

  // 画面遷移はネット優先・失敗時はトップのキャッシュ
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("/").then((m) => m || Response.error())),
    );
    return;
  }

  // 静的アセット(ファイル名にハッシュ付き)はキャッシュ優先
  e.respondWith(
    caches.match(req).then(
      (m) =>
        m ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }),
    ),
  );
});
