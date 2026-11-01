-- Indicator alerts from the Telegram bot, e.g. "/alert usd > ma50": fire when
-- the daily close crosses its moving average. NULL keeps the plain threshold
-- alert; threshold is unused (0) when indicator is set.
ALTER TABLE price_alerts ADD COLUMN indicator TEXT;
