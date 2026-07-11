-- 電子報訂閱名單（先收集，寄送之後再接）
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'subscribed' CHECK(status IN ('subscribed','pending','unsubscribed')),
  source TEXT,                          -- 訂閱來源（頁面路徑）
  token TEXT NOT NULL,                  -- 未來 confirm / unsubscribe 連結用
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status, created_at DESC);
