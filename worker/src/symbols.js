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

// Own properties only: a plain TGJU_KEYS[name] check let "constructor" through,
// and the alert cron then bound Object itself as a D1 parameter (#226)
export const isSymbol = (name) => typeof name === "string" && Object.hasOwn(TGJU_KEYS, name);

// Stock-market indices, in index points rather than rial, so they stay out of
// TGJU_KEYS and its rial conversions. tgju's "bourse" is TEDPIX, the Tehran
// Stock Exchange main index; TSETMC itself does not answer from Cloudflare.
export const INDEX_KEYS = {
  tedpix: "bourse",
};

// Everything the Telegram bot can price and alert on
export const BOT_KEYS = { ...TGJU_KEYS, ...INDEX_KEYS };
export const isBotSymbol = (name) => typeof name === "string" && Object.hasOwn(BOT_KEYS, name);
// Rial symbols are shown in toman (rial / 10); indices in points
export const isIndex = (name) => typeof name === "string" && Object.hasOwn(INDEX_KEYS, name);

// Indices are priced in their own points: the only base they pair with, and
// they never act as a base for anything else
export const INDEX_BASE = "points";
export const INDEX_SYMBOLS = Object.keys(INDEX_KEYS);
export const keyOf = (symbol) => (isSymbol(symbol) ? TGJU_KEYS[symbol] : isIndex(symbol) ? INDEX_KEYS[symbol] : undefined);
// A base whose prices are stored as is, with no cross rate
export const isNative = (base) => base === "irr" || base === INDEX_BASE;

export function isSupportedPair(symbol, base) {
  if (isIndex(symbol)) {
    return base === INDEX_BASE;
  }
  return isSymbol(symbol) && (base === "irr" || (isSymbol(base) && base !== symbol));
}
