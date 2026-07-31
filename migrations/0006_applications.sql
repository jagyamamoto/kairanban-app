-- 入会申込(町内会・子ども会): 公開ページから匿名で送信→担当者へ通知(オーナー指示2026-07-28)
CREATE TABLE join_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                -- 'chonai'(町内会) / 'kodomo'(子ども会)
  name TEXT NOT NULL,
  kana TEXT,
  phone TEXT,
  address TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new / contacted / done / declined
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  handled_by INTEGER REFERENCES persons(id),
  handled_at TEXT
);
CREATE INDEX idx_applications_status ON join_applications(status, created_at);
