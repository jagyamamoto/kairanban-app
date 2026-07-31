-- 会館予約: 早朝(6時)利用許可フラグ(タクシー会社など特別な計らい・オーナー指示2026-07-29)
ALTER TABLE persons ADD COLUMN hall_early_access INTEGER NOT NULL DEFAULT 0;

-- キャンセル待ち(仮予約中の枠に対して1予約につき1名まで。reservation_idをPKにして1名制限を担保)
CREATE TABLE reservation_waitlist (
  reservation_id INTEGER PRIMARY KEY REFERENCES reservations(id),
  person_id INTEGER NOT NULL REFERENCES persons(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
