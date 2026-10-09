import tracked from "./symbols.json";

// tgju keys the updater stores
export const TRACKED_SYMBOLS = tracked;

// tgju publishes these only in USD. Every API price is in IRR, so each update
// also stores a rial copy priced with tgju's dollar of the same update (#129).
export const USD_PRICED = ["ons", "silver", "oil_brent", "crypto-ethereum"];
export const USD_KEY = "price_dollar_rl";

export function rialKey(key) {
  return `irr:${key}`;
}

// API symbol -> tgju key, or the rial copy of a USD-priced key
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
  aed: "price_aed",
  try: "price_try",
  cny: "price_cny",
  cad: "price_cad",
  aud: "price_aud",
  "gold-18k": "geram18",
  "gold-24k": "geram24",
  // tgju's market rate for the same coins as the retail ones above (#129)
  "coin-emami-market": "sekee",
  "coin-baharazadi-market": "sekeb",
  "coin-baharazadi-nim-market": "nim",
  "coin-baharazadi-rob-market": "rob",
  "coin-gerami-market": "gerami",
  bitcoin: "crypto-bitcoin-irr",
  tether: "crypto-tether-irr",
  ethereum: rialKey("crypto-ethereum"),
  "gold-ounce": rialKey("ons"),
  "silver-ounce": rialKey("silver"),
  brent: rialKey("oil_brent"),
};

// Any symbol can be priced in IRR (the native unit of every tgju price) or in
// any other symbol, e.g. a coin in USD or USD in gold, as a cross rate
export const API_SYMBOLS = ["irr", ...Object.keys(TGJU_KEYS)];

export function isSupportedPair(symbol, base) {
  return Boolean(TGJU_KEYS[symbol]) && (base === "irr" || (Boolean(TGJU_KEYS[base]) && base !== symbol));
}
