CREATE TABLE IF NOT EXISTS downloads (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  description TEXT,
  badge TEXT,
  version TEXT,
  arch TEXT,
  filename TEXT,
  originalName TEXT,
  storage TEXT,
  size INTEGER,
  createdAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(createdAt);
CREATE INDEX IF NOT EXISTS idx_downloads_filename ON downloads(filename);
