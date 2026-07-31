-- オーナー指示(2026-07-29)
--  1) 会館予約を2ヶ月先まで繰り返し予約できるようにする(毎週・隔週などの便利モード)
--  2) 資料をURL+パスワードで共有できるようにする(LINEオープンチャットへ貼る想定)

-- ---- 1) 繰り返し予約 ----
-- 同じ申込からまとめて作られた予約に同じIDを入れる。まとめて取り消すために使う。
ALTER TABLE reservations ADD COLUMN repeat_group TEXT;
CREATE INDEX idx_res_repeat_group ON reservations (repeat_group);

-- ---- 2) 資料の共有リンク ----
-- ⚠ これは level(役員のみ/会員/公開)の権限を**意図的に迂回する**仕組み。
--   リンクを知っていてパスワードが分かる人なら誰でも開けるため、
--   ・パスワード必須(ハッシュのみ保存。平文は保存しない)
--   ・有効期限必須
--   ・作れるのは資料管理者(senior_officer/admin)だけ
--   ・作成/失効/閲覧はすべて監査ログに残す
--   を必ず守ること。
CREATE TABLE document_shares (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id  INTEGER NOT NULL REFERENCES documents(id),
  token        TEXT    NOT NULL UNIQUE,   -- URLに載る公開ID(推測不能な乱数)
  pw_salt      TEXT    NOT NULL,          -- パスワードのソルト(base64url)
  pw_hash      TEXT    NOT NULL,          -- PBKDF2-SHA256 の結果(base64url)
  label        TEXT,                      -- 「オープンチャット用」など用途メモ
  expires_at   TEXT    NOT NULL,          -- 期限(必須)
  revoked_at   TEXT,                      -- 失効させた日時
  view_count   INTEGER NOT NULL DEFAULT 0,
  last_view_at TEXT,
  created_by   INTEGER REFERENCES persons(id),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_document_shares_doc ON document_shares (document_id, created_at DESC);
