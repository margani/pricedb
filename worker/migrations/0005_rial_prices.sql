-- Rial copies of the prices tgju publishes only in USD (#129), so every API
-- symbol is priced in IRR like the rest. Each record is priced with the free-
-- market dollar of the same granularity at or just before it, rounded to whole
-- rials; records older than the first dollar record are skipped. New updates
-- add these rows themselves (rialRows in src/update.js).
INSERT OR IGNORE INTO prices (symbol, granularity, ts, price, high, low, raw)
SELECT 'irr:' || p.symbol, p.granularity, p.ts, ROUND(p.price * u.price), ROUND(p.high * u.price), ROUND(p.low * u.price), ''
FROM prices p
JOIN prices u
  ON u.symbol = 'price_dollar_rl'
 AND u.granularity = p.granularity
 AND u.ts = (
   SELECT MAX(ts) FROM prices
   WHERE symbol = 'price_dollar_rl' AND granularity = p.granularity AND ts <= p.ts
 )
WHERE p.symbol IN ('ons', 'silver', 'oil_brent', 'crypto-ethereum');

INSERT OR REPLACE INTO latest (symbol, ts, price, high, low, raw, fetched_at)
SELECT 'irr:' || l.symbol, l.ts, ROUND(l.price * u.price), ROUND(l.high * u.price), ROUND(l.low * u.price), '', l.fetched_at
FROM latest l
JOIN latest u ON u.symbol = 'price_dollar_rl'
WHERE l.symbol IN ('ons', 'silver', 'oil_brent', 'crypto-ethereum');
