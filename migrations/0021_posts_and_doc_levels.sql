-- オーナー指示(2026-07-30)
--  1) 資料を会員が投稿できるようにする。既定の公開レベルは「投稿者と同じ高さ以上」。
--  2) 夏祭り・子ども会などの写真を共有するアルバム(ブログ)を作る。
--     ⚠ 肖像権・個人情報のため **一般公開は不可**。公開レベルは資料と同じ仕組み。

-- ---- 資料 ----
-- 投稿者が自分の資料を直せるようにするため、更新者も残す。
ALTER TABLE documents ADD COLUMN updated_by INTEGER REFERENCES persons(id);
-- level は既存の 'officers'/'members'/'public' に加えて
-- 'senior'(上級役員以上) / 'admin_only'(管理者のみ) / 'kodomo' / 'seniors' を使う。
-- 判定は src/shared/levels.ts に一本化しているのでスキーマ側の変更は不要。

-- ---- 写真アルバム(ブログ) ----
CREATE TABLE posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  body        TEXT,                              -- 説明・本文(任意)
  -- ⚠ 'public' は入れない。サーバ側(POST_LEVELS)でも弾いている。
  level       TEXT    NOT NULL DEFAULT 'members',
  event_date  TEXT,                              -- 行事の日付(任意)
  created_by  INTEGER REFERENCES persons(id),
  updated_by  INTEGER REFERENCES persons(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_posts_level ON posts (level, COALESCE(event_date, date(created_at)) DESC);

CREATE TABLE post_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id),
  r2_key     TEXT    NOT NULL,
  file_name  TEXT,
  file_type  TEXT,
  file_size  INTEGER,
  caption    TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES persons(id),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_post_photos_post ON post_photos (post_id, sort, id);
