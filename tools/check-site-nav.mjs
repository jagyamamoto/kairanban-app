// 紹介サイト(docs/)の「ページはあるのに、たどり着けない」を止める検査。
//
// ⚠ なぜこれがあるか（2026-08〜09 に何度も起きた）
//   新しいページを作ったのに、どこからもリンクしていない。
//   自分は直接URLを知っているので気づけない。訪問者だけが気づけない。
//   さらに、ナビに足したつもりで**1ページだけ足し忘れる**ことが起きる。
//   そのページから来た人には、新しいページが存在しないのと同じになる。
//   目視では絶対に見つからない種類の不具合なので、ここで落とす。
//
// 使い方: node tools/check-site-nav.mjs   (npm run check から呼ばれる)

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "docs";
const files = readdirSync(DIR).filter((f) => f.endsWith(".html"));

const pages = files.map((f) => {
  const html = readFileSync(join(DIR, f), "utf8");
  const lang = (html.match(/<html[^>]*\blang="([^"]+)"/) || [])[1] || "ja";
  const nav = (html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/) || [])[1] || "";
  const foot = (html.match(/<div class="footer-links">([\s\S]*?)<\/div>/) || [])[1] || "";
  // ⚠ lang-switch(日本語⇔English の切り替え)は、ページごとに相手が違うのが正しい。
  //   ai-story.html は ai-story-en.html を、press.html は press-en.html を指す。
  //   ここを数えると、正しい状態を「ふぞろい」と誤判定する。
  const localLinks = (part) =>
    [...part.matchAll(/<a\s[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => !/class="[^"]*lang-switch/.test(tag))
      .map((tag) => (tag.match(/href="([^"#?]+\.html)"/) || [])[1])
      .filter((h) => h && !h.includes("//"));
  return { file: f, lang, nav: localLinks(nav), foot: localLinks(foot), hasNav: nav !== "" };
});

const errors = [];

// (1) 孤児ページ: どこからもリンクされていない
const linkedFromSomewhere = new Set();
for (const p of pages) for (const h of [...p.nav, ...p.foot]) linkedFromSomewhere.add(h);
for (const p of pages) {
  if (p.file === "index.html") continue;
  if (!linkedFromSomewhere.has(p.file)) {
    errors.push(`${p.file} は、どのページからもリンクされていません（訪問者はたどり着けません）`);
  }
}

// (2) 同じ言語のページは、ナビの中身がそろっていること
for (const lang of [...new Set(pages.map((p) => p.lang))]) {
  const group = pages.filter((p) => p.lang === lang && p.hasNav);
  if (group.length < 2) continue;
  const base = group[0];
  const baseSet = [...new Set(base.nav)].sort().join(",");
  for (const p of group.slice(1)) {
    const set = [...new Set(p.nav)].sort().join(",");
    if (set !== baseSet) {
      const missing = base.nav.filter((h) => !p.nav.includes(h));
      const extra = p.nav.filter((h) => !base.nav.includes(h));
      const detail = [
        missing.length ? `足りない: ${missing.join(" ")}` : "",
        extra.length ? `余分: ${extra.join(" ")}` : "",
      ]
        .filter(Boolean)
        .join(" / ");
      errors.push(`${p.file} のナビが ${base.file} とそろっていません（${detail}）`);
    }
  }
}

if (errors.length) {
  console.error("紹介サイトの行き先に問題があります。\n");
  for (const e of errors) console.error("  ✗ " + e);
  console.error("\n直す場所: docs/ の各HTMLの <nav class=\"site-nav\"> と <div class=\"footer-links\">");
  console.error("⚠ 新しいページを足したら、**同じ言語のページ全部**のナビに足すこと。");
  process.exit(1);
}

console.log(`サイトの行き先の検査: OK（${pages.length}ページ、孤児なし・ナビ一致）`);
