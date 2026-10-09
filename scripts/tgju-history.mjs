// Turns tgju's public daily history into backfill SQL for the days our D1
// database has no daily price for (#186: the old GitHub Actions updater
// recorded nothing from 2026-05 to 2026-09).

const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const number = (text) => Number(String(text).replace(/,/g, ""));
const quote = (text) => `'${String(text).replace(/'/g, "''")}'`;
const formatNumber = (value) => value.toLocaleString("en-US", { maximumFractionDigits: 8 });

// The Tehran calendar day of a UTC instant, as YYYY-MM-DD
export function tehranDay(iso) {
  return new Date(new Date(iso).getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
}

// A tgju history row is [open, low, high, close, change, percent, date, date].
// The last two hold the Gregorian date as 2026/10/08 or 2026-10-08 and, for
// some keys (price_dollar_rl), the Jalali one (1405/07/16) instead, so pick
// whichever is Gregorian. The high and low columns are sometimes swapped
// (oil_brent), so take the extremes of all four prices.
function gregorianDate(row) {
  for (const cell of [row[7], row[6]]) {
    const match = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(String(cell ?? ""));
    if (match && Number(match[1]) >= 1900) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

export function parseHistoryRow(row) {
  const prices = row.slice(0, 4).map(number);
  const date = gregorianDate(row);
  if (!date || prices.some((p) => !Number.isFinite(p) || p <= 0)) {
    return null;
  }
  return { date, price: prices[3], high: Math.max(...prices), low: Math.min(...prices) };
}

// Inserts for one symbol's missing days, in batches of VALUES rows. Each row
// is stamped 17:00 Tehran (13:30 UTC), and NOT EXISTS skips any day that
// already has a daily record, so a database that has since filled the day,
// or a second run, changes nothing.
export function backfillStatements(key, rows, batchSize = 300) {
  const values = rows.map(({ date, price, high, low }) => {
    const ts = `${date}T13:30:00.000Z`;
    const dayStart = new Date(Date.parse(`${date}T00:00:00.000Z`) - TEHRAN_OFFSET_MS).toISOString();
    const dayEnd = new Date(Date.parse(dayStart) + 24 * 60 * 60 * 1000).toISOString();
    const raw = JSON.stringify({ p: formatNumber(price), h: formatNumber(high), l: formatNumber(low), ts: `${date} 17:00:00` });
    return `(${quote(ts)},${price},${high},${low},${quote(raw)},${quote(dayStart)},${quote(dayEnd)})`;
  });
  const statements = [];
  for (let i = 0; i < values.length; i += batchSize) {
    statements.push(
      `INSERT INTO prices (symbol, granularity, ts, price, high, low, raw)\n` +
        `SELECT ${quote(key)}, 'daily', v.column1, v.column2, v.column3, v.column4, v.column5 FROM (VALUES\n` +
        values.slice(i, i + batchSize).join(",\n") +
        `\n) v WHERE NOT EXISTS (SELECT 1 FROM prices p WHERE p.symbol = ${quote(key)} AND p.granularity = 'daily' AND p.ts >= v.column6 AND p.ts < v.column7);`
    );
  }
  return statements;
}

// Days in [from, to] that tgju has but we don't
export function missingDays(historyRows, knownDays, from, to) {
  return historyRows
    .map(parseHistoryRow)
    .filter((row) => row && row.date >= from && row.date <= to && !knownDays.has(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}
