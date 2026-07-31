-- 会員からの登録申請(役員の手入力だけでは回らないため、本人に申請してもらう)。
-- 申請は persons を status='pending' で作り、既存の承認フロー(POST /members/:id/approve)に乗せる。
ALTER TABLE persons ADD COLUMN address TEXT;              -- 七丁目以降の住所
ALTER TABLE persons ADD COLUMN requested_roles TEXT;      -- 本人の自己申告(JSON配列)。承認時に役員が直す前提
ALTER TABLE persons ADD COLUMN signup_note TEXT;          -- 申請時の連絡事項
