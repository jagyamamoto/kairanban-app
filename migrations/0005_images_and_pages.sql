-- 回覧への画像添付(R2・無料枠)
ALTER TABLE circulars ADD COLUMN image_key TEXT;

-- 静的ページ(町会について・ゴミ出し情報・子ども会など。旧ホームページ統合用・オーナー指示2026-07-28)
CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,         -- 'about' / 'garbage' / 'kodomo-kai' 等
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft / published
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER NOT NULL REFERENCES persons(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE page_translations (
  page_id INTEGER NOT NULL REFERENCES pages(id),
  lang TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  quality TEXT NOT NULL DEFAULT 'machine', -- machine / reviewed
  PRIMARY KEY (page_id, lang)
);
