-- 会館予約の担当者(当日の連絡先)。オーナー指示により入力必須にする。
-- 既存行には申請者名を暫定で入れる(NOT NULL制約はつけず、アプリ側で必須チェック)。
ALTER TABLE reservations ADD COLUMN contact_name TEXT;
ALTER TABLE reservations ADD COLUMN contact_phone TEXT;

UPDATE reservations
SET contact_name = (SELECT p.name FROM persons p WHERE p.id = reservations.applicant_id)
WHERE contact_name IS NULL;
