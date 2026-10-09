-- Price history. symbol is the tgju key (e.g. price_dollar_rl); ts is UTC ISO-8601.
-- raw keeps the original tgju record ({p,h,l,ts}) so the legacy JSON files can be
-- served unchanged.
CREATE TABLE prices (
  symbol TEXT NOT NULL,
  granularity TEXT NOT NULL CHECK (granularity IN ('daily', 'hourly')),
  ts TEXT NOT NULL,
  price REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  raw TEXT NOT NULL,
  PRIMARY KEY (symbol, granularity, ts)
) WITHOUT ROWID;

CREATE TABLE latest (
  symbol TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  price REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  raw TEXT NOT NULL,
  fetched_at TEXT NOT NULL
) WITHOUT ROWID;

-- One row per scheduled update, used by /v1/health
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  saved INTEGER NOT NULL DEFAULT 0,
  invalid TEXT,
  error TEXT
);

CREATE INDEX runs_ok_started_at ON runs (ok, started_at);
