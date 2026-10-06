import { TGJU_KEYS } from "./symbols";
import { toTehranDay } from "./time";

const SITE = "https://api.priceto.day";

const FEED_SYMBOLS = [
  ["usd", "USD"],
  ["euro", "EUR"],
  ["gbp", "GBP"],
  ["gold-miskal", "Gold miskal"],
  ["coin-emami", "Emami coin"],
  ["coin-baharazadi", "Bahar Azadi coin"],
];

export const FEED_KEYS = FEED_SYMBOLS.map(([symbol]) => TGJU_KEYS[symbol]);

const escapeXml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

const toman = (rial) => Math.round(rial / 10).toLocaleString("en-US");

export function historyCsv(points) {
  const lines = points.map((p) => [p.time, p.price, p.high, p.low].join(","));
  return ["time,price,high,low", ...lines].join("\n") + "\n";
}

// One RSS item per Tehran day with the last price of each feed symbol that day
export function dailyFeed(rows) {
  const days = new Map();
  for (const row of rows) {
    const day = toTehranDay(new Date(row.ts)).toJSON().slice(0, 10);
    if (!days.has(day)) {
      days.set(day, { lastTs: row.ts, prices: {} });
    }
    const entry = days.get(day);
    entry.prices[row.symbol] = row.price;
    if (row.ts > entry.lastTs) {
      entry.lastTs = row.ts;
    }
  }

  const items = [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, { lastTs, prices }]) => {
      const description = FEED_SYMBOLS.filter(([symbol]) => prices[TGJU_KEYS[symbol]])
        .map(([symbol, name]) => `${name}: ${toman(prices[TGJU_KEYS[symbol]])} Toman`)
        .join(" · ");
      return `<item>
<title>Prices on ${day}</title>
<link>${SITE}/v1/history/irr/usd?from=${day}&amp;to=${day}T23:59:59Z</link>
<guid isPermaLink="false">pricedb-${day}</guid>
<pubDate>${new Date(lastTs).toUTCString()}</pubDate>
<description>${escapeXml(description)}</description>
</item>`;
    });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>pricedb: daily prices in Iran's free market</title>
<link>https://github.com/margani/pricedb</link>
<atom:link href="${SITE}/v1/feed.xml" rel="self" type="application/rss+xml"/>
<description>Daily closing prices of USD, EUR, GBP, gold and coins in Toman.</description>
${items.join("\n")}
</channel>
</rss>
`;
}
