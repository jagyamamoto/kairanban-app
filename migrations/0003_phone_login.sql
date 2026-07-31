-- ログインを会員コードから電話番号へ変更(2026-07-28 オーナー指示)
-- SMS確認は行わない。電話番号そのものが認証情報(admin/副管理者が事前に登録する)。
DROP INDEX idx_persons_invite;
ALTER TABLE persons DROP COLUMN invite_code;
ALTER TABLE persons ADD COLUMN phone TEXT;
CREATE UNIQUE INDEX idx_persons_phone ON persons(phone);

-- ログイン試行のレート制限(電話番号総当たり対策)
CREATE TABLE login_attempts (
  bucket TEXT NOT NULL,              -- 'YYYY-MM-DDTHH'(UTC時単位)
  ip TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, ip)
);
