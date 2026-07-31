-- オーナー指示(2026-07-30)
--  「回覧に実施日欄をつくり、実施日当日・前日・7日前に通知を出す」
--  「掲載終了日を29日としたら29日23時59分まで掲載する」
--
-- 実施日は任意(行事ではない回覧もあるため)。

ALTER TABLE circulars ADD COLUMN event_date TEXT; -- 行事の実施日(任意)

-- 実施日の前後で出すお知らせの送信台帳。同じ回覧・同じ種類は二度送らない。
--   event_7d  = 実施日の7日前
--   event_1d  = 実施日の前日
--   event_day = 実施日の当日
CREATE TABLE circular_notices (
  circular_id INTEGER NOT NULL REFERENCES circulars(id),
  kind        TEXT    NOT NULL,
  sent_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (circular_id, kind)
);

CREATE INDEX idx_circulars_event ON circulars (event_date);
