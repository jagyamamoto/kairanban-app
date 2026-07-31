// 自治体の防災・安全メール(公開アーカイブRSS)の取り込み。
// 自治体が公開しているRSSを取得し、町会の地域に関係するものだけを残してD1に貯める。
// 自治体の配信そのものを置き換えるものではなく「町会サイトでも読める」ようにする補助。
// 公式登録への導線は画面側に必ず残すこと。
//
// ⚠ **既定では取り込み元が空**なので、この機能は画面に出ない(0件なら非表示)。
//   使う場合は、導入する地域の自治体RSSを ALERT_SOURCES に登録し、
//   下の地名リスト(KAIRANBAN/NEARBY/FAR)を自地域の町名に書き換える。
import { type Env, audit } from "./core";

export type AlertSource = {
  key: string;
  label: string;      // 表示用の出典名
  feed: string;
  archive: string;
  wardWide: boolean;  // 地名が出ない自治体全体の情報も採用するか
  areas: string[];    // このエリア名が出たら「近隣」として採用
  // rss = RSS2フィード / listHtml = RSSが無い自治体向けに一覧HTMLを解析する
  kind: "rss" | "listHtml";
};

// 取り込み元(既定は空=機能オフ)。書き方のサンプル:
// export const ALERT_SOURCES: AlertSource[] = [
//   {
//     key: "city",
//     label: "みどり区",                        // 架空の例
//     feed: "https://www.example.com/?feed=rss2",  // 自治体の公開RSS
//     archive: "https://www.example.com/",
//     wardWide: true,   // 区全体への呼びかけも拾う
//     areas: [],
//     kind: "rss",
//   },
// ];
export const ALERT_SOURCES: AlertSource[] = [];

// 画面に出す「出典」リンク。取り込み元が未設定なら空文字(画面側は0件で非表示になる)。
export const AREA_ALERT_ARCHIVE: string = ALERT_SOURCES[0]?.archive ?? "";

// 会員が「自分ごと」として読むべき地名(架空のサンプル。自地域の町名に書き換える)
const KAIRANBAN = ["みどり町"];
// 同じ自治体内で隣接・近接する町名(サンプル)
const NEARBY = ["ひがし町", "にし町"];
// 同じ自治体でも明らかに遠い地域(埋もれ防止のため出さない)(サンプル)
const FAR = ["うみべ町"];

export type AlertScope = "kairanban" | "nearby" | "ward";

/** 本文から、この町会にとっての関連度を判定する。関連しなければ null。 */
export function classify(
  text: string,
  src: Pick<AlertSource, "wardWide" | "areas">,
): { scope: AlertScope; matched: string[] } | null {
  // 隣接区: 指定エリアの地名が出たときだけ「近隣」として採用する
  if (!src.wardWide) {
    const hit = src.areas.filter((k) => text.includes(k));
    return hit.length ? { scope: "nearby", matched: hit } : null;
  }

  const hitK = KAIRANBAN.filter((k) => text.includes(k));
  if (hitK.length) return { scope: "kairanban", matched: hitK };

  const hitN = NEARBY.filter((k) => text.includes(k));
  if (hitN.length) return { scope: "nearby", matched: hitN };

  // 地名が出てこない = 区全体への呼びかけ(気象警報・熱中症・防犯など)。みどり町も対象なので残す。
  const hitF = FAR.filter((k) => text.includes(k));
  if (hitF.length) return null; // 遠方の地名だけが並ぶ情報(臨海部の停電など)は除外
  return { scope: "ward", matched: [] };
}

function stripTags(html: string): string {
  return html
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tag(xml: string, name: string): string {
  // content:encoded など名前空間つきにも対応
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1] : "";
}

export type ParsedAlert = {
  guid: string;
  title: string;
  body: string;
  link: string;
  publishedAt: string;
};

/** RSS(rss2)を素朴にパースする。依存を増やさないため正規表現で処理する。 */
export function parseFeed(xml: string): ParsedAlert[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const out: ParsedAlert[] = [];
  for (const raw of items) {
    const title = stripTags(tag(raw, "title"));
    const link = stripTags(tag(raw, "link"));
    const guid = stripTags(tag(raw, "guid")) || link;
    const encoded = tag(raw, "content:encoded") || tag(raw, "description");
    const body = stripTags(encoded);
    const pub = stripTags(tag(raw, "pubDate"));
    const t = pub ? Date.parse(pub) : NaN;
    if (!guid || !title) continue;
    out.push({
      guid,
      title,
      body,
      link,
      publishedAt: Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString(),
    });
  }
  return out;
}

/** RSSを提供しない自治体向け: バックナンバー一覧HTMLを解析する。
 *  <article data-href="...">…<span class="small">2026/7/28 14:45</span>…<h3>件名</h3><p>本文</p></article> */
export function parseListHtml(html: string): ParsedAlert[] {
  const out: ParsedAlert[] = [];
  const articles = html.match(/<article[\s\S]*?<\/article>/gi) ?? [];
  for (const raw of articles) {
    const href = raw.match(/data-href="([^"]+)"/)?.[1] ?? "";
    const when = raw.match(/<span class="small">\s*([\d/]+\s+[\d:]+)\s*<\/span>/)?.[1] ?? "";
    const title = stripTags(raw.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    const body = stripTags(raw.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
    if (!href || !title) continue;
    // "2026/7/28 14:45" は日本時間。UTCのISO8601に直す。
    let publishedAt = new Date().toISOString();
    const m = when.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
    if (m) {
      const [, y, mo, d, h, mi] = m;
      publishedAt = new Date(
        Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 9, Number(mi)),
      ).toISOString();
    }
    out.push({ guid: href, title, body, link: href, publishedAt });
  }
  return out;
}

/** 1ソースぶんの取り込み。 */
async function ingestSource(env: Env, src: AlertSource): Promise<number> {
  let xml: string;
  try {
    const res = await fetch(src.feed, {
      headers: { "User-Agent": "kairanban-demo/1.0 (neighborhood association site)" },
      cf: { cacheTtl: 60 },
    });
    if (!res.ok) return 0;
    xml = await res.text();
  } catch {
    return 0;
  }
  let saved = 0;
  const items = src.kind === "listHtml" ? parseListHtml(xml) : parseFeed(xml);
  for (const it of items) {
    const hit = classify(`${it.title}\n${it.body}`, src);
    if (!hit) continue;
    const r = await env.DB.prepare(
      `INSERT INTO area_alerts (guid, title, body, link, published_at, scope, matched, source)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(guid) DO NOTHING`,
    )
      .bind(
        it.guid,
        it.title,
        it.body,
        it.link || null,
        it.publishedAt,
        hit.scope,
        hit.matched.join(","),
        src.label,
      )
      .run();
    if (r.meta.changes) saved++;
  }
  return saved;
}

/** 取り込み本体。全ソースを回し、新規のみINSERTする。 */
export async function ingestAreaAlerts(env: Env): Promise<{ saved: number }> {
  let saved = 0;
  for (const src of ALERT_SOURCES) {
    saved += await ingestSource(env, src);
  }
  if (saved) {
    await audit(env.DB, null, "area_alert.ingest", undefined, undefined, { saved });
  }
  // 古いものは消す(表示は直近のみで十分。DBを無制限に太らせない)
  await env.DB.prepare(
    "DELETE FROM area_alerts WHERE published_at < datetime('now','-90 days')",
  ).run();
  return { saved };
}
