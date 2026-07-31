-- 回覧の掲載開始日・掲載終了日(任意)。掲載終了日を過ぎたら自動的に記録(archived)へ移す。
-- 未設定の場合は公開から1週間で自動的に記録へ移す(cron.tsで判定)。
ALTER TABLE circulars ADD COLUMN publish_start_date TEXT;
ALTER TABLE circulars ADD COLUMN publish_end_date TEXT;
