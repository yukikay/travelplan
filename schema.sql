CREATE TABLE IF NOT EXISTS item_state (
  id TEXT PRIMARY KEY,
  done INTEGER NOT NULL CHECK (done IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
