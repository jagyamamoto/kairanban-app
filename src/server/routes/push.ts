// Web Push購読の登録・解除(PWA利用者の通知)
import { Hono } from "hono";
import { type AppEnv, HttpError, audit, requireActive } from "../core";

const push = new Hono<AppEnv>();

push.post("/subscribe", async (c) => {
  const u = requireActive(c);
  const b = await c.req.json<{
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  }>();
  if (!b.endpoint || !b.endpoint.startsWith("https://") || !b.keys?.p256dh || !b.keys?.auth) {
    throw new HttpError(400, "購読情報が正しくありません");
  }
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (person_id, endpoint, p256dh, auth) VALUES (?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET person_id=excluded.person_id, p256dh=excluded.p256dh, auth=excluded.auth`,
  )
    .bind(u.id, b.endpoint, b.keys.p256dh, b.keys.auth)
    .run();
  await audit(c.env.DB, u.id, "push.subscribe", "person", u.id);
  return c.json({ ok: true });
});

push.post("/unsubscribe", async (c) => {
  const u = requireActive(c);
  const b = await c.req.json<{ endpoint?: string }>();
  if (!b.endpoint) throw new HttpError(400, "endpointが必要です");
  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=? AND person_id=?")
    .bind(b.endpoint, u.id)
    .run();
  await audit(c.env.DB, u.id, "push.unsubscribe", "person", u.id);
  return c.json({ ok: true });
});

export default push;
