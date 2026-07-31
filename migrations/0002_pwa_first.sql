-- PWA主体への転換: 会員コードログインとWeb Push通知
-- 会員コード: 管理者が発行し紙でも配布できるログインコード
ALTER TABLE persons ADD COLUMN invite_code TEXT;
CREATE UNIQUE INDEX idx_persons_invite ON persons(invite_code);

-- Web Push購読(PWA利用者向けの無料通知)
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES persons(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_push_person ON push_subscriptions(person_id);
