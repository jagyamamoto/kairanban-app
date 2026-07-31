// デモサイトに入れる架空のデータ。
//
// ⚠ 登場する人物・団体はすべて架空です。実在のものとは関係ありません。
// ⚠ SQLをそのまま並べています。列名を変えるマイグレーションを足したら、ここも直してください。
//    検証: bash tools/check-demo-seed.sh

export const DEMO_SEED_SQL: string[] = [
  // ---- 会員(架空) ----
  `INSERT INTO persons (id, name, kana, address, household_head, phone, status, approved_at, is_digital) VALUES
    (1,'山田 太郎','やまだ たろう','1-2-3','山田 太郎','09000000001','active',datetime('now'),1),
    (2,'佐藤 花子','さとう はなこ','1-5-8','佐藤 花子','09000000002','active',datetime('now'),1),
    (3,'鈴木 一郎','すずき いちろう','2-1-1','鈴木 一郎','09000000003','active',datetime('now'),1),
    (4,'田中 美咲','たなか みさき','2-4-7','田中 美咲','09000000004','active',datetime('now'),1),
    (5,'高橋 健','たかはし けん','3-2-9','高橋 健','09000000005','active',datetime('now'),1),
    (6,'伊藤 洋子','いとう ようこ','3-6-2','伊藤 洋子','09000000006','active',datetime('now'),1),
    (7,'渡辺 修','わたなべ おさむ','1-9-4','渡辺 修','09000000007','active',datetime('now'),1),
    (8,'中村 恵美','なかむら えみ','2-8-6','中村 恵美','09000000008','active',datetime('now'),1),
    (9,'小林 大輔','こばやし だいすけ','3-1-5','小林 大輔','09000000009','active',datetime('now'),1),
    (10,'加藤 里美','かとう さとみ','1-7-2','加藤 里美','09000000010','active',datetime('now'),1)`,

  `INSERT INTO role_assignments (person_id, role, granted_by) VALUES
    (1,'admin',1),
    (2,'senior_officer',1),
    (3,'officer',1),(3,'circular_manager',1),
    (4,'officer',1),(4,'hall_manager',1),
    (5,'kodomo_officer',1),
    (6,'member',1),(6,'kodomo_parent',1),
    (7,'member',1),(7,'seniors_member',1),
    (8,'member',1),(9,'member',1),(10,'member',1)`,

  // ---- 回覧(架空) ----
  `INSERT INTO circulars (case_no, title, body, audience, visibility, status, published_at, deadline, created_by) VALUES
    ('KR-2026-0004','夏まつり 出店のお手伝い募集',
     '8月23日(土)の夏まつりで、模擬店のお手伝いをしてくださる方を募集します。

時間: 15:00〜20:00(交代制)
場所: みどり中央公園

1時間だけでも助かります。お子さん連れでの参加も歓迎です。
お手伝いいただける方は、この回覧の「確認しました」を押したうえで、町会役員までお声がけください。',
     'all','both','published',datetime('now','-1 days'),date('now','+14 days'),1),
    ('KR-2026-0003','資源回収の日程が変わります(9月から)',
     '9月より、資源回収の曜日が変わります。

変更前: 第2・第4 水曜日
変更後: 第1・第3 木曜日

お間違えのないようお願いいたします。カレンダーへの記入をおすすめします。',
     'all','both','published',datetime('now','-4 days'),date('now','+20 days'),1),
    ('KR-2026-0002','防災訓練のお知らせ(9月1日)',
     '9月1日(火)に、町会の防災訓練を行います。

集合: 9:30 みどり町第一小学校 校庭
内容: 消火器の使い方、AEDの使い方、炊き出し

動きやすい服装でお越しください。参加は自由です。当日は非常食の配布もあります。',
     'all','members','published',datetime('now','-9 days'),date('now','+25 days'),1),
    ('KR-2026-0001','会費納入のお願い',
     '本年度の町会費の納入をお願いいたします。

金額: 年額 3,600円(月300円)
方法: 班長がお伺いします

ご不明な点は町会役員までお問い合わせください。',
     'all','members','published',datetime('now','-16 days'),date('now','+10 days'),1)`,

  // ---- 会館予約(架空) ----
  `INSERT INTO reservations (case_no, org_name, date, start_time, end_time, purpose, status, applicant_id, contact_name, contact_phone, created_at) VALUES
    ('KY-2026-0007','みどり合唱団',date('now','+3 days'),'10:00','12:00','コーラス練習','approved',3,'鈴木 一郎','09000000003',datetime('now','-5 days')),
    ('KY-2026-0008','みどり書道会',date('now','+5 days'),'14:00','16:00','書道教室','approved',4,'田中 美咲','09000000004',datetime('now','-4 days')),
    ('KY-2026-0009','町会役員会',date('now','+8 days'),'19:00','21:00','9月度 役員会','received',2,'佐藤 花子','09000000002',datetime('now','-1 days')),
    ('KY-2026-0010','みどり体操クラブ',date('now','+12 days'),'10:00','12:00','体操教室','approved',7,'渡辺 修','09000000007',datetime('now','-2 days'))`,

  // ---- 会合(架空) ----
  `INSERT INTO meetings (case_no, title, date, start_time, place, audience, deadline, status, created_by) VALUES
    ('KG-2026-0005','9月度 定例役員会',date('now','+10 days'),'19:00','みどり町三丁目町会会館','officers',date('now','+7 days'),'published',1)`,

  // ---- 町会資料(架空) ----
  `INSERT INTO documents (title, description, category, levels, doc_date, created_by, created_at) VALUES
    ('町会 会則','令和8年度 総会で承認されたものです','kiyaku','["members"]',date('now','-60 days'),1,datetime('now')),
    ('令和8年度 総会議事録','役員だけが見られる設定の例です','gijiroku','["officers"]',date('now','-58 days'),1,datetime('now'))`,

  // ---- 広告(架空) ----
  `INSERT INTO sponsors (name, message, status, start_date, created_by) VALUES
    ('みどり商店会','地域のお店を応援しています。夏のセール開催中です。','published',date('now','-30 days'),1)`,
];
