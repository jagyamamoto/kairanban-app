-- 回覧の公開レベルを3段階に変更(オーナー指示2026-07-28): members(会員のみ) / public(非会員=公開のみ) / both(両方)
-- is_publicはbothに、それ以外はmembersに引き継ぐ。publicは公開ページのみに掲載し会員アプリの確認一覧には出さない。
ALTER TABLE circulars ADD COLUMN visibility TEXT NOT NULL DEFAULT 'members';
UPDATE circulars SET visibility = CASE WHEN is_public = 1 THEN 'both' ELSE 'members' END;
ALTER TABLE circulars DROP COLUMN is_public;
