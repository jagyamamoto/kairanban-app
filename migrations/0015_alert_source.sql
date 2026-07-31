-- 取り込み元(自治体名)を記録し、表示で出典を示せるようにする。
ALTER TABLE area_alerts ADD COLUMN source TEXT NOT NULL DEFAULT 'みどり区';
