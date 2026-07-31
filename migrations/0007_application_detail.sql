-- 入会申込の追加項目(町内会=世帯人数、子ども会=お子様複数名・お手伝い保護者・LINE ID・保険同意)
-- 旧ホームページの実フォーム構成に合わせるためJSON列で柔軟に保持する。
ALTER TABLE join_applications ADD COLUMN detail TEXT;
