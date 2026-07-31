-- オーナー指示(2026-07-30): 「誰が見られるか」を**複数選択**にする。
-- 例) 「子ども会のみ」＋「シニアクラブのみ」の両方に見せる、など。
--
-- level(1つだけ) → levels(JSONの配列) に移す。
-- ⚠ 古い level 列は**消す**。2か所に正解があると必ず片方だけ直して事故になるため。
--   判定は src/shared/levels.ts の canViewAny() に一本化している。

-- ---- 資料 ----
ALTER TABLE documents ADD COLUMN levels TEXT;
UPDATE documents SET levels = json_array(level) WHERE levels IS NULL;
DROP INDEX IF EXISTS idx_documents_level;
ALTER TABLE documents DROP COLUMN level;
CREATE INDEX idx_documents_date ON documents (COALESCE(doc_date, date(created_at)) DESC, id DESC);

-- ---- 写真アルバム ----
ALTER TABLE posts ADD COLUMN levels TEXT;
UPDATE posts SET levels = json_array(level) WHERE levels IS NULL;
DROP INDEX IF EXISTS idx_posts_level;
ALTER TABLE posts DROP COLUMN level;
CREATE INDEX idx_posts_date ON posts (COALESCE(event_date, date(created_at)) DESC, id DESC);
