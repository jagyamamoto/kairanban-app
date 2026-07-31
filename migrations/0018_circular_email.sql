-- 回覧のメール配信(オーナー指示 2026-07-29)
-- メールアドレスを登録した会員には、閲覧できる範囲の回覧をメールでも送る。
-- 開封(トラッキング画像)と「確認しました」ボタンを circular_confirmations に記録し、
-- アプリで確認したのと同じ扱いにする。

-- 配信停止(メール本文のリンクから本人が止められる)
ALTER TABLE persons ADD COLUMN email_optout INTEGER NOT NULL DEFAULT 0;

-- 送信済みの記録。同じ回覧を二重に送らないためと、送信失敗を追うため。
CREATE TABLE circular_emails (
  circular_id INTEGER NOT NULL REFERENCES circulars(id),
  person_id   INTEGER NOT NULL REFERENCES persons(id),
  sent_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  status      TEXT    NOT NULL DEFAULT 'sent',  -- sent / failed
  error       TEXT,
  PRIMARY KEY (circular_id, person_id)
);

-- 「メールで確認した」を見分けられるように method に 'email' を使う
-- (circular_confirmations.method は既存: app / paper / phone)
