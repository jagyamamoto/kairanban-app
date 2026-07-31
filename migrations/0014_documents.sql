-- 資料置き場(規約・総会/集会の報告資料など)。
-- 重要書類が多いため既定は「役員のみ」。level で公開範囲を切り替える。
--   officers = 役員のみ(既定) / members = 会員以上 / public = どなたでも(公開ページ)
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other', -- rules | minutes | budget | form | other
  level TEXT NOT NULL DEFAULT 'officers',
  file_key TEXT,                          -- R2のキー
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  doc_date TEXT,                          -- 資料の日付(総会の開催日など・任意)
  created_by INTEGER REFERENCES persons(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_documents_level ON documents (level, doc_date DESC, created_at DESC);
