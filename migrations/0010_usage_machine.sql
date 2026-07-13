-- 多機器用量：每台機器一列，讀取時同日 SUM。
-- SQLite 不能改 UNIQUE 約束，整表重建。既有資料標為 twtp1hws1104（當時唯一的推送機）。

CREATE TABLE usage_daily_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
  day TEXT NOT NULL, -- YYYY-MM-DD
  machine TEXT NOT NULL DEFAULT 'main',
  tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  messages INTEGER NOT NULL DEFAULT 0,
  models TEXT, -- JSON: {"model-id": tokens}
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, day, machine)
);

INSERT INTO usage_daily_new (provider, day, machine, tokens, cost_usd, messages, models, updated_at)
SELECT provider, day, 'twtp1hws1104', tokens, cost_usd, messages, models, updated_at FROM usage_daily;

DROP TABLE usage_daily;
ALTER TABLE usage_daily_new RENAME TO usage_daily;

CREATE INDEX IF NOT EXISTS idx_usage_daily ON usage_daily(provider, day DESC);
