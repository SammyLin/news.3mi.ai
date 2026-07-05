-- news-3mi D1 初始化
-- Cloudflare D1 (SQLite-compatible)

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#58a6ff',
  icon TEXT DEFAULT '📁',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content_md TEXT NOT NULL,
  content_html TEXT,
  cover_image TEXT,
  source_url TEXT,
  source_type TEXT,
  category_id INTEGER,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  is_featured INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  reading_time INTEGER DEFAULT 1,
  published_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS article_tags (
  article_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (article_id, tag_id),
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_articles_status_pub ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_featured ON articles(is_featured, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_tags_tag ON article_tags(tag_id);

-- 觸發器：更新 updated_at
CREATE TRIGGER IF NOT EXISTS trg_articles_updated_at
AFTER UPDATE ON articles
BEGIN
  UPDATE articles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
