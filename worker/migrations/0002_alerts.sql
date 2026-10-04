-- State of each alert, so notifications are sent on changes rather than on every run
CREATE TABLE alerts (
  name TEXT PRIMARY KEY,
  active INTEGER NOT NULL,
  since TEXT,
  last_notified_at TEXT,
  message TEXT
) WITHOUT ROWID;
