// Third price source: the free-market dollar on bonbast.com, a currency
// exchange board that publishes buy and sell quotes in toman. Opt-in only
// (`?source=bonbast`): it is stored under its own key and never feeds the
// default price or the tgju/Bitpin average, so a change on their side cannot
// disturb the prices the API already serves.
const BONBAST_URL = "https://www.bonbast.com";
const USER_AGENT = "Mozilla/5.0 (compatible; pricedb/1.0; +https://github.com/margani/pricedb)";

export const BONBAST_SOURCE = "bonbast";
export const BONBAST_USD = "bonbast:usd";

// The /json endpoint wants the token embedded in the homepage's script and
// answers an empty {"reset":1} without the st_bb cookie the homepage sets
const TOKEN_PATTERN = /param:\s*"([^"]+)"/;

export async function fetchBonbastQuotes({ fetchImpl = fetch } = {}) {
  const page = await fetchImpl(`${BONBAST_URL}/`, { headers: { "user-agent": USER_AGENT } });
  if (!page.ok) {
    throw new Error(`bonbast homepage responded ${page.status}`);
  }

  const token = TOKEN_PATTERN.exec(await page.text())?.[1];
  if (!token) {
    throw new Error("bonbast homepage has no token; the page changed");
  }

  const response = await fetchImpl(`${BONBAST_URL}/json`, {
    method: "POST",
    headers: {
      "user-agent": USER_AGENT,
      referer: `${BONBAST_URL}/`,
      cookie: "st_bb=0",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ param: token }),
  });
  if (!response.ok) {
    throw new Error(`bonbast responded ${response.status}`);
  }

  return response.json();
}

// usd1 is the sell and usd2 the buy quote, in toman; rows are in rial like
// tgju. The board has no daily range, so high is the sell and low the buy
// quote.
export function bonbastRow(quotes, now) {
  const [sell, buy] = [quotes?.usd1, quotes?.usd2].map((v) => Number(v) * 10);
  if (![sell, buy].every((v) => Number.isFinite(v) && v > 0) || buy > sell) {
    return null;
  }

  return {
    symbol: BONBAST_USD,
    ts: now.toISOString(),
    price: sell,
    high: sell,
    low: buy,
    raw: JSON.stringify({ usd1: quotes.usd1, usd2: quotes.usd2, created: quotes.created }),
  };
}
