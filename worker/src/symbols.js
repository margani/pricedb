import tracked from "../../src/tgju/symbols.json";

// tgju keys the updater stores
export const TRACKED_SYMBOLS = tracked;

// API symbol -> tgju key
export const TGJU_KEYS = {
  usd: "price_dollar_rl",
  euro: "price_eur",
  gbp: "price_gbp",
  "gold-miskal": "mesghal",
  "coin-emami": "retail_sekee",
  "coin-baharazadi": "retail_sekeb",
  "coin-baharazadi-nim": "retail_nim",
  "coin-baharazadi-rob": "retail_rob",
  "coin-gerami": "retail_gerami",
};

// Supported symbol/base pairs. IRR is the native unit of every tgju price; other
// bases are cross rates computed from two IRR prices.
const PAIRS = [
  ["usd", "irr"],
  ["gbp", "irr"],
  ["euro", "irr"],
  ["gold-miskal", "irr"],
  ["coin-emami", "irr"],
  ["coin-baharazadi", "irr"],
  ["coin-baharazadi-nim", "irr"],
  ["coin-baharazadi-rob", "irr"],
  ["coin-gerami", "irr"],
  ["coin-baharazadi", "gbp"],
  ["coin-baharazadi", "usd"],
  ["coin-baharazadi", "euro"],
];

export const API_SYMBOLS = ["irr", ...new Set(PAIRS.map(([symbol]) => symbol))];

export function isSupportedPair(symbol, base) {
  return PAIRS.some(([s, b]) => s === symbol && b === base);
}
