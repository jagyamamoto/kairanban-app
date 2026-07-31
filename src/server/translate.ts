// 公開回覧・固定ページの自動翻訳(Cloudflare Workers AI 無料枠)
// 方針: 機械翻訳は quality='machine' で保存し、担当者が確認後 'reviewed' に更新できる。
import type { Env } from "./core";

// 翻訳モデル。@cf/meta/llama-3.1-8b-instruct は2026-05-30に廃止され、
// 以降ずっと翻訳が無言で失敗していた(エラーを握りつぶしていたため気づけなかった)。
// 定数にして差し替えやすくしておく。
const TRANSLATE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export const TARGET_LANGS: { code: string; instruction: string }[] = [
  {
    code: "ja-easy",
    instruction:
      "やさしい日本語(小学生や日本語学習者にも分かる、短い文・簡単な言葉)に書き直してください。",
  },
  { code: "en", instruction: "Translate into natural English." },
  { code: "zh", instruction: "Translate into Simplified Chinese (简体中文)." },
  { code: "vi", instruction: "Translate into Vietnamese (Tiếng Việt)." },
];

// Workers AIの応答形式はモデルによって異なる。
//  - 旧: { response: "..." }
//  - 新(OpenAI互換): { choices: [{ message: { content: "..." } }] }
// どちらでも本文を取り出せるようにする(モデル差し替えで無言に壊れないように)。
type AiResult = {
  response?: unknown;
  choices?: { message?: { content?: unknown } }[];
};
function responseText(result: AiResult): string {
  if (typeof result?.response === "string") return result.response;
  const c = result?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  return "";
}

function extractJson(text: string): { title: string; body: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const raw = text.slice(start, end + 1);
  try {
    const obj = JSON.parse(raw);
    if (typeof obj.title === "string" && typeof obj.body === "string") {
      return { title: obj.title, body: obj.body };
    }
  } catch {
    // モデルが文字列の中に生の改行を出すとJSON.parseが失敗する。
    // 安全安心メールのように複数行＋URLを含む本文で頻発するため、
    // title/body を直接取り出すフォールバックを用意する。
    const pick = (key: string): string | null => {
      const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,\\s*"|\\}\\s*$)`));
      if (!m) return null;
      return m[1]
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    };
    const title = pick("title");
    const body = pick("body");
    if (title !== null && body !== null) return { title, body };
  }
  return null;
}

export async function translateOne(
  env: Env,
  lang: { code: string; instruction: string },
  title: string,
  body: string,
): Promise<{ title: string; body: string } | null> {
  try {
    // 固有名詞の対訳表。防災・行政情報では地名や施設名の取り違えが実害になる
    // (実運用で、区名や神社名をAIが別の実在地名に誤訳した実例があった)。
    // ⚠ ここは**導入する地域の地名・施設名に書き換える**(以下は架空のサンプル)。
    const glossary =
      "みどり区 = Midori Ward, みどり町 = Midori-machi, " +
      "みどり町会館 = Midori-machi Community Hall, みどり中央公園 = Midori Central Park";

    // 「やさしい日本語」は出力そのものが日本語。英語の指示文だと英訳して返してしまう
    // 事象が続いたため、この言語だけ指示文も日本語にする。
    const system =
      lang.code === "ja-easy"
        ? "あなたは日本の町内会の文章を「やさしい日本語」に書き直す担当です。" +
          "出力は必ず日本語で書いてください。英語など他の言語には絶対にしないでください。" +
          "小学生や日本語を勉強中の人にも分かるように、短い文・簡単な言葉に書き直します。" +
          "むずかしい言葉には、かっこで読み方や言いかえを書いてください。" +
          "内容は足したり減らしたりしないでください。" +
          "数字・日付・時刻・電話番号・URLはそのまま残してください。" +
          "件名(title)と本文(body)の両方を書き直してください。" +
          'JSONだけで答えてください: {"title": "...", "body": "..."}'
        : "You are a translator for a Japanese neighborhood association (町内会). " +
          "Translate the given text faithfully. Do not add or omit information. " +
          "NEVER guess or substitute place names. Use exactly these readings: " +
          glossary +
          ". Keep numbers, dates, times, phone numbers and URLs exactly as they appear. " +
          "You MUST translate BOTH the title and the body. " +
          "Do not leave any Japanese text untranslated in your output (except the proper nouns " +
          "in the mapping above, and numbers/dates/URLs). " +
          'Respond ONLY with JSON: {"title": "...", "body": "..."}';

    const result = (await env.AI.run(TRANSLATE_MODEL as any, {
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${lang.instruction}\n\nタイトル: ${title}\n\n本文:\n${body}`,
        },
      ],
      // ベトナム語などは同じ内容でもトークン数が膨らむ。2048では長めの回覧で
      // 出力が途中で切れてJSONが壊れ、その言語だけ翻訳されない事象が起きた。
      max_tokens: 6000,
    })) as AiResult;
    const parsed = extractJson(responseText(result));
    if (!parsed) {
      // 応答は返ったが形式が想定外。原因調査できるよう先頭だけ記録する。
      console.error("translateOne: unparseable response", lang.code, responseText(result).slice(0, 200));
    }
    return parsed;
  } catch (e) {
    // AIバインディングの失敗(未有効化・無料枠超過・ネットワーク等)を握りつぶさない
    console.error("translateOne: AI call failed", lang.code, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function translateCircular(env: Env, circularId: number): Promise<void> {
  const c = await env.DB.prepare("SELECT id, title, body FROM circulars WHERE id=?")
    .bind(circularId)
    .first<{ id: number; title: string; body: string }>();
  if (!c) return;
  for (const lang of TARGET_LANGS) {
    const parsed = await translateOne(env, lang, c.title, c.body);
    if (!parsed) continue; // 翻訳失敗した言語はスキップ(公開PWAは日本語にフォールバック)
    await env.DB.prepare(
      `INSERT INTO circular_translations (circular_id, lang, title, body, quality)
       VALUES (?,?,?,?,'machine')
       ON CONFLICT(circular_id, lang) DO UPDATE SET title=excluded.title, body=excluded.body, quality='machine'`,
    )
      .bind(c.id, lang.code, parsed.title, parsed.body)
      .run();
  }
}

export async function translatePage(env: Env, pageId: number): Promise<void> {
  const p = await env.DB.prepare("SELECT id, title, body FROM pages WHERE id=?")
    .bind(pageId)
    .first<{ id: number; title: string; body: string }>();
  if (!p) return;
  for (const lang of TARGET_LANGS) {
    const parsed = await translateOne(env, lang, p.title, p.body);
    if (!parsed) continue;
    await env.DB.prepare(
      `INSERT INTO page_translations (page_id, lang, title, body, quality)
       VALUES (?,?,?,?,'machine')
       ON CONFLICT(page_id, lang) DO UPDATE SET title=excluded.title, body=excluded.body, quality='machine'`,
    )
      .bind(p.id, lang.code, parsed.title, parsed.body)
      .run();
  }
}
