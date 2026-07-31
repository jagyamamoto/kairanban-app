-- みどり町三丁目町会アプリ Ver.1 初期スキーマ
-- 方針: DBを正式記録とする。人物と役割・任期を分離。重要更新は audit_log に記録。

-- ============ 人物 ============
CREATE TABLE persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kana TEXT,
  line_user_id TEXT UNIQUE,          -- LINE連携識別子(紙利用者はNULL)
  contact TEXT,                      -- 電話など(任意・最小限)
  lang TEXT NOT NULL DEFAULT 'ja',   -- ja / ja-easy / en / zh / vi
  is_digital INTEGER NOT NULL DEFAULT 1, -- 0=紙・電話利用者(代理入力対象)
  status TEXT NOT NULL DEFAULT 'pending', -- pending / active / left
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  approved_by INTEGER REFERENCES persons(id)
);

-- ============ 役割(任期つき) ============
-- role: member / kodomo_parent / kodomo_officer / officer / hall_manager /
--        circular_manager / pr / senior_officer / observer / admin
CREATE TABLE role_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES persons(id),
  role TEXT NOT NULL,
  scope TEXT,                        -- 例: 'kodomo' / 'chonai'(オブザーバー区分用)
  start_date TEXT NOT NULL DEFAULT (date('now')),
  end_date TEXT,                     -- 任期末。過ぎると自動失効
  granted_by INTEGER REFERENCES persons(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_roles_person ON role_assignments(person_id);

-- ============ 対象グループ ============
CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id),
  person_id INTEGER NOT NULL REFERENCES persons(id),
  PRIMARY KEY (group_id, person_id)
);

-- ============ 回覧 ============
CREATE TABLE circulars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_no TEXT NOT NULL UNIQUE,      -- 案件番号 例: KA-2026-0001
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all', -- all / officers / kodomo / group:<id>
  is_public INTEGER NOT NULL DEFAULT 0, -- 1=公開PWAにも掲載(多言語)
  deadline TEXT,                     -- 確認期限(date)
  status TEXT NOT NULL DEFAULT 'draft', -- draft / pending_approval / published / archived
  created_by INTEGER NOT NULL REFERENCES persons(id),
  approved_by INTEGER REFERENCES persons(id),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 公開PWA用の翻訳(公開回覧のみ対象)
CREATE TABLE circular_translations (
  circular_id INTEGER NOT NULL REFERENCES circulars(id),
  lang TEXT NOT NULL,                -- ja-easy / en / zh / vi
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  quality TEXT NOT NULL DEFAULT 'machine', -- machine / reviewed
  PRIMARY KEY (circular_id, lang)
);

-- 「開いた」と「確認しました」を分けて記録。代理入力は proxy_by と method で区別。
CREATE TABLE circular_confirmations (
  circular_id INTEGER NOT NULL REFERENCES circulars(id),
  person_id INTEGER NOT NULL REFERENCES persons(id),
  opened_at TEXT,
  confirmed_at TEXT,
  method TEXT NOT NULL DEFAULT 'app', -- app / paper / phone
  proxy_by INTEGER REFERENCES persons(id),
  PRIMARY KEY (circular_id, person_id)
);

-- ============ 会館予約 ============
CREATE TABLE reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_no TEXT NOT NULL UNIQUE,      -- 例: KY-2026-0001
  org_name TEXT NOT NULL,            -- 利用団体名
  applicant_id INTEGER NOT NULL REFERENCES persons(id),
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  purpose TEXT NOT NULL,
  headcount INTEGER,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'received', -- received / checking / approved / rejected / cancelled / done
  status_reason TEXT,                -- 差戻し理由など
  assignee_id INTEGER REFERENCES persons(id), -- 「担当します」を押した会館係
  audio_key TEXT,                    -- 音声メモ(将来: R2キー)
  proxy_by INTEGER REFERENCES persons(id), -- 代理申請の入力者
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_res_date ON reservations(date);

-- ============ 会合(第2段階) ============
CREATE TABLE meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_no TEXT NOT NULL UNIQUE,      -- 例: KM-2026-0001
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT,
  place TEXT,
  audience TEXT NOT NULL DEFAULT 'officers',
  has_meal INTEGER NOT NULL DEFAULT 0,
  deadline TEXT,                     -- 回答期限
  status TEXT NOT NULL DEFAULT 'open', -- draft / open / closed / done
  created_by INTEGER NOT NULL REFERENCES persons(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE meeting_responses (
  meeting_id INTEGER NOT NULL REFERENCES meetings(id),
  person_id INTEGER NOT NULL REFERENCES persons(id),
  answer TEXT NOT NULL,              -- yes / no / undecided
  headcount INTEGER NOT NULL DEFAULT 1, -- 本人+同伴者
  meal_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,                         -- アレルギー等の任意連絡
  proxy_by INTEGER REFERENCES persons(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (meeting_id, person_id)
);

-- ============ イベント(第3段階・共通モデル) ============
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_no TEXT NOT NULL UNIQUE,      -- 例: KE-2026-0001
  kind TEXT NOT NULL,                -- christmas / summer_festival / autumn_festival / other
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  overview TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  apply_deadline TEXT,
  status TEXT NOT NULL DEFAULT 'preparing', -- preparing / day / closed
  created_by INTEGER NOT NULL REFERENCES persons(id),
  cloned_from INTEGER REFERENCES events(id), -- 次回イベントへ複製
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE event_participants (
  event_id INTEGER NOT NULL REFERENCES events(id),
  person_id INTEGER NOT NULL REFERENCES persons(id),
  answer TEXT NOT NULL DEFAULT 'yes',
  headcount INTEGER NOT NULL DEFAULT 1,
  meal_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  proxy_by INTEGER REFERENCES persons(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, person_id)
);
CREATE TABLE event_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  person_id INTEGER REFERENCES persons(id),
  role_name TEXT NOT NULL,           -- 例: 受付 / 焼きそば / 警備
  shift_start TEXT,
  shift_end TEXT,
  place TEXT,                        -- 集合場所
  confirmed_at TEXT                  -- 本人の「確認しました」
);
CREATE TABLE event_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  title TEXT NOT NULL,
  owner_id INTEGER REFERENCES persons(id),
  due TEXT,
  status TEXT NOT NULL DEFAULT 'todo', -- todo / doing / done / help(要支援)
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE event_loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  item TEXT NOT NULL,                -- ハッピ / 腕章 / 無線機 等
  person_id INTEGER REFERENCES persons(id),
  lent_at TEXT,
  returned_at TEXT
);
CREATE TABLE event_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  body TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES persons(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE event_alert_acks (
  alert_id INTEGER NOT NULL REFERENCES event_alerts(id),
  person_id INTEGER NOT NULL REFERENCES persons(id),
  acked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (alert_id, person_id)
);

-- ============ 通知(LINE無料枠 月200通の予算管理) ============
CREATE TABLE notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,               -- '2026-08'
  to_person INTEGER REFERENCES persons(id),
  kind TEXT NOT NULL,                -- circular_new / circular_remind / reservation_new / reservation_result / ...
  status TEXT NOT NULL,              -- sent / skipped_budget / skipped_config / failed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notif_month ON notification_log(month, status);

-- ============ 監査ログ ============
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  actor_id INTEGER REFERENCES persons(id),
  action TEXT NOT NULL,              -- 例: circular.publish / reservation.claim / member.approve
  target_type TEXT,
  target_id TEXT,
  detail TEXT                        -- JSON文字列
);
CREATE INDEX idx_audit_at ON audit_log(at);

-- ============ 案件番号の連番 ============
CREATE TABLE counters (
  key TEXT PRIMARY KEY,              -- 例: 'KA-2026'
  value INTEGER NOT NULL
);
