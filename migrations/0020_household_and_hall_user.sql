-- オーナー指示(2026-07-30)
--  1) 町内会は世帯ごと(世帯主・代表者名義)、子ども会は保護者ごとの参加。
--     ただし世帯主でない人が役員になることもあるため、
--     「本人」と「世帯の名義人」を別に持てるようにする。
--  2) 会館予約はログイン不要にし、「会館予約者」という役割を作る。
--     ⚠ 会館予約者は町会の外の人(貸館利用者)なので、回覧・資料は見せない。
--  3) 予約の前後で自動通知を出す(未確定・前日確認・開始・終了10分前・終了)。

-- ---- 1) 世帯主・代表者名義 ----
-- 町内会の登録名義。本人が名義人ならこの欄も本人の氏名が入る。
ALTER TABLE persons ADD COLUMN household_head TEXT;

-- ---- 2) 公開予約の連絡先メール ----
-- persons.email は一意制約があり、家族で同じアドレスを使う場合などに入れられない。
-- 通知を確実に届けるため、予約そのものにも連絡先メールを持たせる。
ALTER TABLE reservations ADD COLUMN contact_email TEXT;
-- 誰の申込か(member=会員が自分で / public=ログインなしの公開フォーム / proxy=役員の代理)
ALTER TABLE reservations ADD COLUMN created_via TEXT NOT NULL DEFAULT 'member';

-- ---- 3) 予約に関する自動通知の送信記録 ----
-- 同じ予約・同じ種類の通知を二度送らないための台帳。
--   unconfirmed_2d = 利用2日前になっても確定していない
--   day_before     = 前日「キャンセルは不要ですか?」
--   start          = 利用開始時刻
--   end_10min      = 終了10分前
--   end            = 利用終了
CREATE TABLE reservation_notices (
  reservation_id INTEGER NOT NULL REFERENCES reservations(id),
  kind           TEXT    NOT NULL,
  sent_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (reservation_id, kind)
);
