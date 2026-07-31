-- 広告枠(将来のLINE有料プラン移行資金づくり・オーナー指示2026-07-28)
-- 地域の業者向けに、公開ページと会員アプリへ掲載できる広告枠。画像は業者側ホスティングのURLを貼るだけ
-- (R2等のストレージ追加なし=運用コストゼロを維持)。
CREATE TABLE sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                -- 広告主名
  message TEXT NOT NULL,             -- 広告文(短文)
  url TEXT,                          -- リンク先(任意)
  image_url TEXT,                    -- 画像URL(任意・広告主側ホスティング)
  start_date TEXT,                   -- 掲載開始日(空欄なら即時)
  end_date TEXT,                     -- 掲載終了日(空欄なら無期限)
  status TEXT NOT NULL DEFAULT 'draft', -- draft / active / archived
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES persons(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sponsors_status ON sponsors(status, sort_order);
