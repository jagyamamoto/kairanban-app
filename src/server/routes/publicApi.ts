// 公開PWA用API: 匿名利用・個人情報なし・個人別既読なし
import { Hono } from "hono";
import { AREA_ALERT_ARCHIVE } from "../areaalerts";
import { TARGET_LANGS, translateOne } from "../translate";
import { type AppEnv, HttpError } from "../core";

const publicApi = new Hono<AppEnv>();

const PUBLIC_LANGS = ["ja", "ja-easy", "en", "zh", "vi"];

publicApi.get("/info", (c) => {
  return c.json({ appName: c.env.APP_NAME, langs: PUBLIC_LANGS });
});

// 公開中に加え、終了済み(archived)も含めて過去のお知らせを遡って閲覧できる
publicApi.get("/circulars", async (c) => {
  const lang = PUBLIC_LANGS.includes(c.req.query("lang") || "") ? c.req.query("lang")! : "ja";
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.case_no, c.title, c.body, c.deadline, c.published_at, c.image_key,
            t.title AS t_title, t.body AS t_body, t.quality
     FROM circulars c
     LEFT JOIN circular_translations t ON t.circular_id=c.id AND t.lang=?
     WHERE c.status IN ('published','archived') AND c.visibility IN ('public','both')
     ORDER BY c.published_at DESC LIMIT 100`,
  )
    .bind(lang === "ja" ? "__none__" : lang)
    .all<{
      id: number;
      case_no: string;
      title: string;
      body: string;
      deadline: string | null;
      published_at: string;
      image_key: string | null;
      t_title: string | null;
      t_body: string | null;
      quality: string | null;
    }>();
  return c.json({
    lang,
    circulars: rows.results.map((r) => ({
      id: r.id,
      case_no: r.case_no,
      title: r.t_title ?? r.title,
      body: r.t_body ?? r.body,
      deadline: r.deadline,
      published_at: r.published_at,
      image_url: r.image_key ? `/api/images/circular/${r.id}` : null,
      translated: r.t_title != null,
      quality: r.quality,
    })),
  });
});

publicApi.get("/circulars/:id", async (c) => {
  const lang = PUBLIC_LANGS.includes(c.req.query("lang") || "") ? c.req.query("lang")! : "ja";
  const id = Number(c.req.param("id"));
  const r = await c.env.DB.prepare(
    `SELECT c.id, c.case_no, c.title, c.body, c.deadline, c.published_at, c.image_key,
            t.title AS t_title, t.body AS t_body, t.quality
     FROM circulars c
     LEFT JOIN circular_translations t ON t.circular_id=c.id AND t.lang=?
     WHERE c.id=? AND c.status IN ('published','archived') AND c.visibility IN ('public','both')`,
  )
    .bind(lang === "ja" ? "__none__" : lang, id)
    .first<{
      id: number;
      case_no: string;
      title: string;
      body: string;
      deadline: string | null;
      published_at: string;
      image_key: string | null;
      t_title: string | null;
      t_body: string | null;
      quality: string | null;
    }>();
  if (!r) throw new HttpError(404, "お知らせが見つかりません");
  return c.json({
    lang,
    circular: {
      id: r.id,
      case_no: r.case_no,
      title: r.t_title ?? r.title,
      body: r.t_body ?? r.body,
      deadline: r.deadline,
      published_at: r.published_at,
      image_url: r.image_key ? `/api/images/circular/${r.id}` : null,
      translated: r.t_title != null,
      quality: r.quality,
    },
  });
});

// こうとう安全安心メール(公開アーカイブ)の取り込み分。みどり町・近隣に関係するものだけ返す。
// lang指定があり日本語以外なら、Workers AIで翻訳してD1にキャッシュする(PWAでは
// ブラウザの翻訳機能が使えないため、サーバ側で訳しておく)。
publicApi.get("/alerts", async (c) => {
  const lang = c.req.query("lang") || "ja";
  const limit = Math.min(Number(c.req.query("limit")) || 5, 20);
  const rows = await c.env.DB.prepare(
    `SELECT guid, title, body, link, published_at, scope, matched, source
     FROM area_alerts ORDER BY published_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<{
      guid: string;
      title: string;
      body: string;
      link: string | null;
      published_at: string;
      scope: string;
      matched: string | null;
      source: string;
    }>();

  const items = rows.results;
  if (lang === "ja" || items.length === 0) {
    return c.json({ alerts: items.map((r) => ({ ...r, translated: false })), source: AREA_ALERT_ARCHIVE });
  }

  const target = TARGET_LANGS.find((l) => l.code === lang);
  if (!target) {
    return c.json({ alerts: items.map((r) => ({ ...r, translated: false })), source: AREA_ALERT_ARCHIVE });
  }

  const cached = await c.env.DB.prepare(
    `SELECT guid, title, body FROM area_alert_translations WHERE lang=?`,
  )
    .bind(lang)
    .all<{ guid: string; title: string; body: string }>();
  const map = new Map(cached.results.map((r) => [r.guid, r]));

  const out: unknown[] = [];
  const toTranslate: typeof items = [];
  for (const r of items) {
    const hit = map.get(r.guid);
    if (hit) out.push({ ...r, title: hit.title, body: hit.body, translated: true });
    else {
      out.push({ ...r, translated: false });
      toTranslate.push(r);
    }
  }

  // 未翻訳ぶんはレスポンス後に翻訳してキャッシュ(次回以降は訳文が出る)。
  // 1リクエストで訳す件数は絞り、無料枠を使い切らないようにする。
  if (toTranslate.length) {
    const env = c.env;
    c.executionCtx.waitUntil(
      (async () => {
        for (const r of toTranslate.slice(0, 3)) {
          const t = await translateOne(env, target, r.title, r.body);
          if (!t) continue;
          await env.DB.prepare(
            `INSERT INTO area_alert_translations (guid, lang, title, body) VALUES (?,?,?,?)
             ON CONFLICT(guid, lang) DO NOTHING`,
          )
            .bind(r.guid, lang, t.title, t.body)
            .run();
        }
      })(),
    );
  }
  return c.json({ alerts: out, source: AREA_ALERT_ARCHIVE });
});

export default publicApi;
