-- 会員レベル(役割)の変更依頼。会員が申請し、管理者が承認/見送りする。
CREATE TABLE role_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES persons(id),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', -- new | done | declined
  handled_by INTEGER REFERENCES persons(id),
  handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_role_requests_status ON role_requests (status, created_at);
