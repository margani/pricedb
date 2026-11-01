// Technical indicators over daily closes, for the bot's indicator alerts

export const MA_PERIODS = [50, 200];

// "ma50" -> 50, anything else -> null
export function parseIndicator(text) {
  const match = /^ma(\d+)$/i.exec(String(text ?? ""));
  const period = match ? Number(match[1]) : null;
  return MA_PERIODS.includes(period) ? period : null;
}

// Simple moving average of the last `period` values, or null without enough data
export function sma(values, period) {
  if (!(period > 0) || values.length < period) {
    return null;
  }
  const window = values.slice(-period);
  return window.reduce((sum, value) => sum + value, 0) / period;
}

// The last `period` daily closes of a tgju key, oldest first
export async function dailyCloses(db, key, period) {
  const { results } = await db
    .prepare("SELECT price FROM prices WHERE symbol = ?1 AND granularity = 'daily' ORDER BY ts DESC LIMIT ?2")
    .bind(key, period)
    .all();
  return results.map((row) => row.price).reverse();
}

export async function movingAverage(db, key, period) {
  return sma(await dailyCloses(db, key, period), period);
}
