-- Googleログイン(Gmail)用。メールアドレスで既存の会員と結びつける。
-- 電話番号ログインは従来どおり残す(どちらでも入れる)。
ALTER TABLE persons ADD COLUMN email TEXT;
CREATE UNIQUE INDEX idx_persons_email ON persons (email) WHERE email IS NOT NULL;
