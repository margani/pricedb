import { badgeColor, formatValue, renderBadge } from "./badge";
import { renderCandlestickChart, renderLineChart } from "./chart";
import { getDailyPricesAt, getDailyRows, getHealth, getHistory, getLatest } from "./db";
import { datasetCsv } from "./dataset";
import { FEED_KEYS, dailyFeed, historyCsv } from "./feed";
import { API_SYMBOLS, TGJU_KEYS, TRACKED_SYMBOLS, isSupportedPair } from "./symbols";
import { SECOND_SOURCE, SECOND_SOURCE_USD } from "./second-source";
import { daysAgo, parseDateParam, toTehranDay } from "./time";
import { getUsage } from "./usage";

const json = (data, status = 200) => Response.json(data, { status });

const notSupported = (symbol, base) => json({ error: `No exchange rate found for [${symbol}] and [${base}]` }, 404);

// Only the daily high/low of each leg is known, not when they happened, so a
// cross rate's real high/low can't be derived. Return the widest possible range.
export function crossRate(symbol, base) {
  return {
    price: symbol.price / base.price,
    high: symbol.high / base.low,
    low: symbol.low / base.high,
  };
}

const toDailyPoint = (row) => ({
  price: row.price,
  high: row.high,
  low: row.low,
  time: toTehranDay(new Date(row.ts)).toJSON(),
});

// Daily points for a symbol in IRR, or joined with the base on matching days
export function buildHistory(symbolRows, baseRows) {
  const symbolPoints = symbolRows.map(toDailyPoint);
  if (!baseRows) {
    return symbolPoints;
  }

  // Some days have more than one record; pair each base record with the
  // symbol record of the same day that is closest in time
  const distance = (a, b) => Math.abs(new Date(a.ts) - new Date(b.ts));
  return baseRows
    .flatMap((baseRow) => {
      const day = toDailyPoint(baseRow).time;
      const candidates = symbolRows.filter((_, i) => symbolPoints[i].time === day);
      if (!candidates.length) {
        return [];
      }

      const symbolRow = candidates.reduce((best, row) => (distance(row, baseRow) < distance(best, baseRow) ? row : best));
      return [{ ...crossRate(symbolRow, baseRow), time: day }];
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

async function loadHistory(db, symbol, base, searchParams, now) {
  const from = parseDateParam(searchParams.get("from"), daysAgo(30, now)).toISOString();
  const to = parseDateParam(searchParams.get("to"), now).toISOString();

  const symbolRows = await getHistory(db, TGJU_KEYS[symbol], "daily", from, to);
  const baseRows = base === "irr" ? null : await getHistory(db, TGJU_KEYS[base], "daily", from, to);
  return buildHistory(symbolRows, baseRows);
}

export function symbols() {
  return json({ success: true, symbols: API_SYMBOLS });
}

// Latest price of a supported pair, or null when the data is missing
async function latestValues(db, symbol, base) {
  const keys = base === "irr" ? [TGJU_KEYS[symbol]] : [TGJU_KEYS[symbol], TGJU_KEYS[base]];
  const rows = await getLatest(db, keys);
  const symbolRow = rows[TGJU_KEYS[symbol]];
  const baseRow = rows[TGJU_KEYS[base]];
  if (!symbolRow || (base !== "irr" && !baseRow)) {
    return null;
  }

  const values = base === "irr" ? symbolRow : crossRate(symbolRow, baseRow);
  return { price: values.price, high: values.high, low: values.low, time: symbolRow.ts };
}

const SOURCES = ["tgju", SECOND_SOURCE, "average"];

// The USD price from the second source (USDT) or the average of both sources
async function usdFromSource(db, source) {
  const rows = await getLatest(db, [TGJU_KEYS.usd, SECOND_SOURCE_USD]);
  const [tgju, second] = [rows[TGJU_KEYS.usd], rows[SECOND_SOURCE_USD]];
  if (!second || (source === "average" && !tgju)) {
    return null;
  }

  if (source === SECOND_SOURCE) {
    return { price: second.price, high: second.high, low: second.low, time: second.ts };
  }

  const mean = (a, b) => (a + b) / 2;
  return {
    price: mean(tgju.price, second.price),
    high: mean(tgju.high, second.high),
    low: mean(tgju.low, second.low),
    time: [tgju.ts, second.ts].sort()[0],
  };
}

export async function latest(db, { symbol, base }, searchParams = new URLSearchParams()) {
  if (!isSupportedPair(symbol, base)) {
    return notSupported(symbol, base);
  }

  const source = searchParams.get("source");
  if (source && !SOURCES.includes(source)) {
    return json({ error: `Unknown source. Use one of: ${SOURCES.join(", ")}` }, 400);
  }

  if (source && source !== "tgju") {
    if (symbol !== "usd" || base !== "irr") {
      return json({ error: "Other sources are only available for usd in irr" }, 400);
    }

    const values = await usdFromSource(db, source);
    return values ? json({ success: true, ...values, source }) : json({ error: "Failed fetching data" }, 500);
  }

  const values = await latestValues(db, symbol, base);
  if (!values) {
    return json({ error: "Failed fetching data" }, 500);
  }

  return json(source ? { success: true, ...values, source } : { success: true, ...values });
}

export async function badge(db, { symbol, base }, searchParams) {
  if (!isSupportedPair(symbol, base)) {
    return notSupported(symbol, base);
  }

  const values = await latestValues(db, symbol, base);
  if (!values) {
    return json({ error: "Failed fetching data" }, 500);
  }

  const svg = renderBadge(
    searchParams.get("label") || symbol.toUpperCase(),
    formatValue(
      values.price,
      nonNegativeInt(searchParams.get("rounding")),
      Math.min(nonNegativeInt(searchParams.get("precision")), 6),
      searchParams.get("unit")
    ),
    badgeColor(searchParams.get("color"))
  );
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8" } });
}

export async function history(db, { symbol, base }, searchParams, now = new Date()) {
  if (!isSupportedPair(symbol, base)) {
    return notSupported(symbol, base);
  }

  const points = await loadHistory(db, symbol, base, searchParams, now);
  if (searchParams.get("format") === "csv") {
    return new Response(historyCsv(points), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `inline; filename="${symbol}-${base}.csv"`,
      },
    });
  }

  return json({ success: true, result: points });
}

export async function feed(db, now = new Date()) {
  const rows = await getDailyRows(db, FEED_KEYS, daysAgo(30, now).toISOString(), now.toISOString());
  return new Response(dailyFeed(rows), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}

const PERIOD_UNITS = { d: 1, w: 7, m: 30, y: 365 };
const DEFAULT_PERIODS = "1d,7d,30d,1y";
const MAX_PERIODS = 10;

// Parses "1d,7d,30d,1y" into [{ period, days }]; null when anything is invalid
export function parsePeriods(value) {
  const periods = (value || DEFAULT_PERIODS).split(",").map((p) => p.trim().toLowerCase());
  if (periods.length > MAX_PERIODS) {
    return null;
  }

  const parsed = periods.map((period) => {
    const match = /^(\d{1,4})([dwmy])$/.exec(period);
    const days = match ? Number(match[1]) * PERIOD_UNITS[match[2]] : 0;
    return days > 0 && days <= 3650 ? { period, days } : null;
  });
  return parsed.every(Boolean) ? parsed : null;
}

export function priceChange(current, previous) {
  const change = current - previous;
  return { change, changePercent: (change / previous) * 100 };
}

export async function change(db, { symbol, base }, searchParams, now = new Date()) {
  if (!isSupportedPair(symbol, base)) {
    return notSupported(symbol, base);
  }

  const periods = parsePeriods(searchParams.get("period"));
  if (!periods) {
    return json({ error: "Invalid period. Use up to 10 values like 1d, 2w, 3m or 1y, separated by commas." }, 400);
  }

  const keys = base === "irr" ? [TGJU_KEYS[symbol]] : [TGJU_KEYS[symbol], TGJU_KEYS[base]];
  const latestRows = await getLatest(db, keys);
  const current = keys.map((key) => latestRows[key]);
  if (current.some((row) => !row)) {
    return json({ error: "Failed fetching data" }, 500);
  }

  const instants = periods.map(({ days }) => daysAgo(days, now).toISOString());
  const [symbolThen, baseThen] = await Promise.all(keys.map((key) => getDailyPricesAt(db, key, instants)));
  const priceOf = (symbolRow, baseRow) => (base === "irr" ? symbolRow.price : symbolRow.price / baseRow.price);
  const currentPrice = priceOf(current[0], current[1]);

  return json({
    success: true,
    price: currentPrice,
    time: current[0].ts,
    changes: periods.map(({ period }, i) => {
      const symbolRow = symbolThen[i];
      const baseRow = baseThen?.[i];
      if (!symbolRow || (base !== "irr" && !baseRow)) {
        return { period, price: null, time: null, change: null, changePercent: null };
      }

      const previous = priceOf(symbolRow, baseRow);
      return { period, price: previous, time: symbolRow.ts, ...priceChange(currentPrice, previous) };
    }),
  });
}

// Converts between any two API symbols through their IRR prices
export async function convert(db, searchParams) {
  const from = (searchParams.get("from") ?? "").toLowerCase();
  const to = (searchParams.get("to") ?? "").toLowerCase();
  const amount = Number(searchParams.get("amount") ?? "1");
  const known = (symbol) => symbol === "irr" || TGJU_KEYS[symbol];
  if (!known(from) || !known(to)) {
    return json({ error: `Unknown symbol. Supported: ${API_SYMBOLS.join(", ")}` }, 400);
  }

  if (!Number.isFinite(amount) || amount < 0) {
    return json({ error: "amount must be a non-negative number" }, 400);
  }

  const keys = [from, to].filter((symbol) => symbol !== "irr").map((symbol) => TGJU_KEYS[symbol]);
  const rows = keys.length ? await getLatest(db, keys) : {};
  const irrPrice = (symbol) => (symbol === "irr" ? 1 : rows[TGJU_KEYS[symbol]]?.price);
  const [fromPrice, toPrice] = [irrPrice(from), irrPrice(to)];
  if (!fromPrice || !toPrice) {
    return json({ error: "Failed fetching data" }, 500);
  }

  const times = keys.map((key) => rows[key].ts).sort();
  return json({
    success: true,
    from,
    to,
    amount,
    rate: fromPrice / toPrice,
    result: (amount * fromPrice) / toPrice,
    time: times[0] ?? null,
  });
}

const DEFAULT_YEARS = [1, 2, 5, 10];
const MAX_GAP_MS = 4 * 24 * 60 * 60 * 1000;

// The same calendar day in previous years (Feb 29 falls back to Feb 28)
export function sameDayYearsAgo(now, years) {
  return years.map((n) => {
    const day = new Date(Date.UTC(now.getUTCFullYear() - n, now.getUTCMonth(), now.getUTCDate()));
    if (day.getUTCMonth() !== now.getUTCMonth()) {
      day.setUTCDate(0);
    }
    return { years: n, day };
  });
}

export async function onThisDay(db, { symbol, base }, now = new Date()) {
  if (!isSupportedPair(symbol, base)) {
    return notSupported(symbol, base);
  }

  const today = toTehranDay(now);
  const targets = sameDayYearsAgo(today, DEFAULT_YEARS);
  // End of each Tehran day in UTC
  const instants = targets.map(({ day }) => new Date(day.getTime() + 20.5 * 60 * 60 * 1000).toISOString());
  const keys = base === "irr" ? [TGJU_KEYS[symbol]] : [TGJU_KEYS[symbol], TGJU_KEYS[base]];
  const [symbolRows, baseRows] = await Promise.all(keys.map((key) => getDailyPricesAt(db, key, instants)));

  return json({
    success: true,
    date: today.toJSON().slice(0, 10),
    result: targets.map(({ years, day }, i) => {
      const symbolRow = symbolRows[i];
      const baseRow = baseRows?.[i];
      // Markets close on weekends and holidays, so accept the last trading day
      // up to a few days before, but nothing older
      const near = (row) => row && day.getTime() - toTehranDay(new Date(row.ts)).getTime() <= MAX_GAP_MS;
      const target = day.toJSON().slice(0, 10);
      if (!near(symbolRow) || (base !== "irr" && !near(baseRow))) {
        return { yearsAgo: years, targetDate: target, date: null, price: null, time: null };
      }

      const price = base === "irr" ? symbolRow.price : symbolRow.price / baseRow.price;
      const date = toTehranDay(new Date(symbolRow.ts)).toJSON().slice(0, 10);
      return { yearsAgo: years, targetDate: target, date, price, time: symbolRow.ts };
    }),
  });
}

const nonNegativeInt = (value) => Math.max(0, Number.parseInt(value ?? "0", 10) || 0);

// Daily open/high/low/close from the hourly records: tgju doesn't publish an
// open or close, so they are the first and last price of each Tehran day
export function buildOhlc(hourlyRows) {
  const days = new Map();
  for (const row of hourlyRows) {
    const time = toTehranDay(new Date(row.ts)).toJSON();
    const day = days.get(time);
    if (!day) {
      days.set(time, { time, open: row.price, high: row.high, low: row.low, close: row.price });
    } else {
      day.high = Math.max(day.high, row.high);
      day.low = Math.min(day.low, row.low);
      day.close = row.price;
    }
  }
  return [...days.values()];
}

const irrOnly = () => json({ error: "OHLC data is only available with base irr" }, 400);

async function loadOhlc(db, symbol, searchParams, now) {
  const from = parseDateParam(searchParams.get("from"), daysAgo(30, now)).toISOString();
  const to = parseDateParam(searchParams.get("to"), now).toISOString();
  return buildOhlc(await getHistory(db, TGJU_KEYS[symbol], "hourly", from, to));
}

export async function ohlc(db, { symbol, base }, searchParams, now = new Date()) {
  if (!isSupportedPair(symbol, base)) {
    return notSupported(symbol, base);
  }

  if (base !== "irr") {
    return irrOnly();
  }

  return json({ success: true, result: await loadOhlc(db, symbol, searchParams, now) });
}

export async function chart(db, { symbol, base }, searchParams, now = new Date()) {
  if (!isSupportedPair(symbol, base)) {
    return notSupported(symbol, base);
  }

  const divisor = Math.pow(10, nonNegativeInt(searchParams.get("rounding")));
  const options = { title: searchParams.get("title"), precision: Math.min(nonNegativeInt(searchParams.get("precision")), 8) };
  let svg;
  if (searchParams.get("type") === "candlestick") {
    if (base !== "irr") {
      return irrOnly();
    }

    const days = await loadOhlc(db, symbol, searchParams, now);
    svg = renderCandlestickChart(
      days.map((d) => ({ time: d.time, open: d.open / divisor, high: d.high / divisor, low: d.low / divisor, close: d.close / divisor })),
      options
    );
  } else {
    const points = await loadHistory(db, symbol, base, searchParams, now);
    svg = renderLineChart(points.map((point) => ({ time: point.time, value: point.price / divisor })), options);
  }

  if (searchParams.get("format") === "svg") {
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8" } });
  }

  // PNG by default, as the chart links in the wild expect. Loaded lazily so
  // the WASM renderer stays out of the other endpoints and the unit tests.
  const { svgToPng } = await import("./png");
  return new Response(await svgToPng(svg), { headers: { "Content-Type": "image/png" } });
}

// Updates run every 30 minutes from 04:00 to 22:59 UTC; overnight the gap is ~5.5 hours
export function healthStatus(lastSuccessAt, now = new Date()) {
  if (!lastSuccessAt) {
    return "stale";
  }

  const hour = now.getUTCHours();
  const allowedMinutes = hour >= 5 && hour < 23 ? 90 : 6 * 60;
  const ageMinutes = (now.getTime() - new Date(lastSuccessAt).getTime()) / 60000;
  return ageMinutes <= allowedMinutes ? "ok" : "stale";
}

export async function health(db, now = new Date()) {
  const row = await getHealth(db);
  const status = healthStatus(row?.last_success_at, now);
  return json(
    {
      success: status === "ok",
      status,
      lastRunAt: row?.last_run_at ?? null,
      lastRunOk: row?.last_run_ok == null ? null : row.last_run_ok === 1,
      lastSuccessAt: row?.last_success_at ?? null,
      latestDataAt: row?.latest_data_at ?? null,
    },
    status === "ok" ? 200 : 503
  );
}

// The JSON files previously served from GitHub (tgju/current/<key>/<file>)
export async function legacyFile(db, key, file) {
  if (!TRACKED_SYMBOLS.includes(key)) {
    return json({ error: "Not found" }, 404);
  }

  if (file === "latest.json") {
    const row = (await getLatest(db, [key]))[key];
    return row ? json(JSON.parse(row.raw)) : json({ error: "Not found" }, 404);
  }

  const granularity = file === "history.json" ? "daily" : "hourly";
  const rows = await getHistory(db, key, granularity, "0000", "9999");
  return json(rows.map((row) => JSON.parse(row.raw)));
}

// Full history of all tracked symbols, published monthly as a GitHub Release
export function dataset(db, file) {
  const granularity = file === "daily.csv" ? "daily" : "hourly";
  return new Response(datasetCsv(db, granularity), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prices-${granularity}.csv"`,
    },
  });
}

export async function stats(db, now = new Date()) {
  return json({ success: true, ...(await getUsage(db, now)) });
}
