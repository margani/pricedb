-- Price alerts users create through the Telegram bot. threshold is in rial.
-- triggered is set when the alert fires and cleared when the price moves back,
-- so each alert fires once per crossing.
CREATE TABLE price_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  threshold REAL NOT NULL,
  triggered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX price_alerts_chat ON price_alerts (chat_id);
