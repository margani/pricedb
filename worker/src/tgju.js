import { parseTehranTimestamp } from "./time";

const TGJU_URL = "https://call1.tgju.org/ajax.json";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetches tgju's current prices, retrying with a growing delay
export async function fetchCurrentPrices({ attempts = 3, delayMs = 2000, fetchImpl = fetch } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(TGJU_URL, { headers: { accept: "application/json" } });
      if (!response.ok) {
        throw new Error(`tgju responded ${response.status}`);
      }

      const body = await response.json();
      if (!body?.current || typeof body.current !== "object") {
        throw new Error("tgju response has no `current` object");
      }

      return body.current;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(delayMs * attempt);
      }
    }
  }

  throw lastError;
}

export function parseNumber(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return NaN;
  }

  return Number(text.replace(/,/g, ""));
}

// Turns a tgju record into a row, or explains why it can't be stored
export function toPriceRow(symbol, record, now = new Date()) {
  if (!record || typeof record !== "object") {
    return { error: "missing" };
  }

  const [price, high, low] = [record.p, record.h, record.l].map(parseNumber);
  if (![price, high, low].every((value) => Number.isFinite(value) && value > 0)) {
    return { error: `invalid price p=${record.p} h=${record.h} l=${record.l}` };
  }

  const time = parseTehranTimestamp(record.ts);
  if (!time) {
    return { error: `invalid ts ${record.ts}` };
  }

  if (time.getTime() > now.getTime() + 60 * 60 * 1000) {
    return { error: `ts in the future ${record.ts}` };
  }

  return {
    row: {
      symbol,
      ts: time.toISOString(),
      price,
      high,
      low,
      raw: JSON.stringify({ p: record.p, h: record.h, l: record.l, ts: record.ts }),
    },
  };
}

// Picks the tracked symbols out of tgju's response and validates them
export function selectRows(current, symbols, now = new Date()) {
  const rows = [];
  const invalid = [];
  for (const symbol of symbols) {
    const { row, error } = toPriceRow(symbol, current[symbol], now);
    if (row) {
      rows.push(row);
    } else {
      invalid.push({ symbol, error });
    }
  }

  return { rows, invalid };
}
