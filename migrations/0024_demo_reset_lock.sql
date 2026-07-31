-- 「触って試せるデモ」の入れ替え処理を、複数リクエストが同時に来ても
-- 二重に実行しないようにするための、鍵の役目をする1行だけのテーブル。
-- 本物の町会(DEMO_MODE無効)では使われない。
CREATE TABLE demo_reset_lock (
  id INTEGER PRIMARY KEY,
  last_reset TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
);
INSERT INTO demo_reset_lock (id, last_reset) VALUES (1, '1970-01-01T00:00:00.000Z');
