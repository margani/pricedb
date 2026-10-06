// Second price source: USDT/Toman on the Bitpin exchange, a close proxy for
// the free-market dollar, used to cross-check tgju. (Wallex was tried first
// but answers requests from Cloudflare Workers with 403.)
const BITPIN_URL = "https://api.bitpin.ir/api/v1/mkt/tickers/";

// Stored next to the tgju keys; the colon keeps it apart from them
export const SECOND_SOURCE = "bitpin";
export const SECOND_SOURCE_USD = "bitpin:usdt";

export async function fetchSecondSourceUsd({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl(BITPIN_URL, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; pricedb/1.0; +https://github.com/margani/pricedb)" },
  });
  if (!response.ok) {
    throw new Error(`bitpin responded ${response.status}`);
  }

  const tickers = await response.json();
  return Array.isArray(tickers) ? tickers.find((t) => t.symbol === "USDT_IRT") : undefined;
}

// Bitpin quotes in toman; rows are in rial like tgju
export function secondSourceRow(ticker, now) {
  const [price, high, low] = [ticker?.price, ticker?.high, ticker?.low].map((v) => Number(v) * 10);
  if (![price, high, low].every((v) => Number.isFinite(v) && v > 0)) {
    return null;
  }

  const time = Number.isFinite(ticker.timestamp) ? new Date(ticker.timestamp * 1000) : now;
  return {
    symbol: SECOND_SOURCE_USD,
    ts: (time > now ? now : time).toISOString(),
    price,
    high,
    low,
    raw: JSON.stringify({ price: ticker.price, high: ticker.high, low: ticker.low, timestamp: ticker.timestamp }),
  };
}

// Relative difference between two prices, as a fraction of their average
export function divergence(a, b) {
  return Math.abs(a - b) / ((a + b) / 2);
}
