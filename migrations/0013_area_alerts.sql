-- こうとう安全安心メールの公開アーカイブ(RSS)を取り込み、みどり町・近隣に関係するものだけ表示する。
-- 出典: 各自治体が公開している防災・安全メールのアーカイブRSS(導入地域に合わせて設定)
CREATE TABLE area_alerts (
  guid TEXT PRIMARY KEY,          -- RSSのguid(重複取り込み防止)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  published_at TEXT NOT NULL,     -- ISO8601(UTC)
  scope TEXT NOT NULL,            -- 'kairanban' | 'nearby' | 'ward'
  matched TEXT,                   -- 一致した地名(表示用・カンマ区切り)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_area_alerts_pub ON area_alerts (published_at DESC);

-- 多言語表示用のキャッシュ(Workers AIで必要になった言語だけ翻訳して貯める)
CREATE TABLE area_alert_translations (
  guid TEXT NOT NULL REFERENCES area_alerts(guid),
  lang TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guid, lang)
);
