-- API requests and distinct clients per UTC day, for /v1/stats (#147)
CREATE TABLE usage_daily (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  -- Filled in when the day is rolled up; today's count comes from usage_clients
  users INTEGER
) WITHOUT ROWID;

-- A random salt per day, so a client hash can't be matched to an IP by
-- hashing every IPv4 address. Deleted with that day's hashes.
CREATE TABLE usage_salts (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
) WITHOUT ROWID;

-- Salted IP hashes for days not yet rolled up; never the IP itself
CREATE TABLE usage_clients (
  day TEXT NOT NULL,
  client TEXT NOT NULL,
  PRIMARY KEY (day, client)
) WITHOUT ROWID;
