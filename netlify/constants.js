import { parseDate } from "./utils";

export const API_ENDPOINT = "https://api.priceto.day";
export const DataSources = {
  tgju: {
    usd: "price_dollar_rl",
    euro: "price_eur",
    gbp: "price_gbp",
    "gold-miskal": "mesghal",
    "coin-emami": "retail_sekee",
    "coin-baharazadi": "retail_sekeb",
    "coin-baharazadi-nim": "retail_nim",
    "coin-baharazadi-rob": "retail_rob",
    "coin-gerami": "retail_gerami",
    mapping: (currency) =>
      `https://raw.github.com/margani/pricedb/main/tgju/current/${currency}`,
    transform: (data) => ({
      price: parseInt(data.p.replace(/,/g, "")),
      high: parseInt(data.h.replace(/,/g, "")),
      low: parseInt(data.l.replace(/,/g, "")),
      time: parseDate(data.ts).toJSON(),
    }),
  },
};

export const CommodityMappings = [
  {
    symbol: "irr",
  },
  {
    symbol: "usd",
    base: "irr",
    source: "tgju",
  },
  {
    symbol: "gbp",
    base: "irr",
    source: "tgju",
  },
  {
    symbol: "eur",
    base: "irr",
    source: "tgju",
  },
  {
    symbol: "gold-miskal",
    base: "irr",
    source: "tgju",
  },
  {
    symbol: "coin-emami",
    base: "irr",
    source: "tgju",
  },
  {
    symbol: "coin-baharazadi",
    base: "irr",
    source: "tgju",
  },
  {
    symbol: "coin-baharazadi-nim",
    base: "irr",
    source: "tgju",
  },
  {
    symbol: "coin-baharazadi-rob",
    base: "irr",
    source: "tgju",
  },
  {
    symbol: "coin-gerami",
    base: "irr",
    source: "tgju",
  },
];
