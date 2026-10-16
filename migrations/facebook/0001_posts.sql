CREATE TABLE IF NOT EXISTS facebook_posts (
  facebook_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published_at TEXT NOT NULL,
  permalink TEXT NOT NULL,
  image_key TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS facebook_posts_feed ON facebook_posts(active, published_at DESC, facebook_id DESC);
CREATE INDEX IF NOT EXISTS facebook_posts_recheck ON facebook_posts(checked_at);
CREATE TABLE IF NOT EXISTS facebook_sync_lock (
  id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires_at INTEGER NOT NULL
);
