import tracked from "./symbols.json";

// tgju keys the updater stores
export const TRACKED_SYMBOLS = tracked;

// API symbol -> tgju key
export const TGJU_KEYS = {
  usd: "price_dollar_rl",
  gbp: "price_gbp",
  euro: "price_eur",
  "gold-miskal": "mesghal",
  "coin-emami": "retail_sekee",
  "coin-baharazadi": "retail_sekeb",
  "coin-baharazadi-nim": "retail_nim",
  "coin-baharazadi-rob": "retail_rob",
  "coin-gerami": "retail_gerami",
};

// Any symbol can be priced in IRR (the native unit of every tgju price) or in
// any other symbol, e.g. a coin in USD or USD in gold, as a cross rate
export const API_SYMBOLS = ["irr", ...Object.keys(TGJU_KEYS)];

export function isSupportedPair(symbol, base) {
  return Boolean(TGJU_KEYS[symbol]) && (base === "irr" || (Boolean(TGJU_KEYS[base]) && base !== symbol));
}
