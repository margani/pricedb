// #232: TEDPIX in the bot and moving-average (indicator) alerts
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseIndicator, sma } from "../src/indicators";
import { evaluatePriceAlerts } from "../src/price-alerts";
import { TRACKED_SYMBOLS } from "../src/symbols";
import { handleUpdate } from "../src/telegram-bot";
import { selectRows } from "../src/tgju";
import { sqliteDb } from "./sqlite";

const MIGRATIONS = [
  "0001_init.sql",
  "0002_alerts.sql",
  "0003_price_alerts.sql",
  "0004_usage.sql",
  "0005_rial_prices.sql",
  "0006_backfill_daily.sql",
  "0007_indicator_alerts.sql",
];
const NOW = new Date("2026-11-01T14:00:00Z");
const DAY = 86400000;

afterEach(() => vi.unstubAllGlobals());

// `days` daily closes of one tgju key ending yesterday, plus its latest price
function db({ key = "price_dollar_rl", closes, latest }) {
  const db = sqliteDb(MIGRATIONS);
  const insert = db.sqlite.prepare("INSERT INTO prices (symbol, granularity, ts, price, high, low, raw) VALUES (?, 'daily', ?, ?, ?, ?, '')");
  closes.forEach((price, i) => {
    const ts = new Date(NOW.getTime() - (closes.length - i) * DAY).toISOString();
    insert.run(key, ts, price, price, price);
  });
  setLatest(db, key, latest);
  return db;
}

function setLatest(db, key, price) {
  db.sqlite
    .prepare(
      `INSERT INTO latest (symbol, ts, price, high, low, raw, fetched_at) VALUES (?1, ?2, ?3, ?3, ?3, '', ?2)
       ON CONFLICT (symbol) DO UPDATE SET price = excluded.price`
    )
    .run(key, NOW.toISOString(), price);
}

const say = (db, text, chat = 1) => handleUpdate(db, { message: { chat: { id: chat }, text } }, NOW);
const alerts = (db) => db.sqlite.prepare("SELECT symbol, direction, threshold, indicator, triggered FROM price_alerts ORDER BY id").all();

function captureSends() {
  const sent = [];
  vi.stubGlobal("fetch", async (url, init) => {
    sent.push(JSON.parse(init.body).text);
    return new Response("{}");
  });
  return sent;
}

describe("indicators", () => {
  it("averages the last n values and needs n of them", () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
    expect(sma([1, 2, 3], 4)).toBeNull();
  });

  it("knows ma50 and ma200 only", () => {
    expect(parseIndicator("ma50")).toBe(50);
    expect(parseIndicator("MA200")).toBe(200);
    expect(parseIndicator("ma20")).toBeNull();
    expect(parseIndicator("50")).toBeNull();
  });
});

describe("TEDPIX", () => {
  it("is tracked from tgju's bourse record (index points, daily timestamp)", () => {
    expect(TRACKED_SYMBOLS).toContain("bourse");
    const record = { p: "7,839,251.0", h: "7,952,794.4", l: "7,838,802.6", ts: "2026-10-31 00:00:00" };
    const { rows, invalid } = selectRows({ bourse: record }, ["bourse"], NOW);
    expect(invalid).toEqual([]);
    expect(rows[0]).toMatchObject({ symbol: "bourse", price: 7839251 });
  });

  it("is priced in index points by the bot", async () => {
    const d = db({ key: "bourse", closes: [], latest: 7839251 });
    expect(await say(d, "/price tedpix")).toBe("tedpix: ۷٬۸۳۹٬۲۵۱ واحد");
  });

  it("stores a TEDPIX threshold in points, not rial", async () => {
    const d = db({ key: "bourse", closes: [], latest: 7839251 });
    await say(d, "/alert tedpix > 8000000");
    expect(alerts(d)).toEqual([{ symbol: "tedpix", direction: "above", threshold: 8000000, indicator: null, triggered: 0 }]);
  });
});

describe("moving-average alerts", () => {
  const flat = (n, value) => Array.from({ length: n }, () => value);

  // TEDPIX has no history before this release, so its averages fill up over time
  it("refuses an alert without enough daily history", async () => {
    const d = db({ key: "bourse", closes: flat(10, 7800000), latest: 7839251 });
    expect(await say(d, "/alert tedpix > ma50")).toContain("کافی");
    expect(alerts(d)).toEqual([]);
  });

  it("starts triggered when the condition already holds, so only a crossing fires", async () => {
    const d = db({ closes: flat(50, 2700000), latest: 2800000 });
    expect(await say(d, "/alert usd > ma50")).toContain("ma50");
    expect(alerts(d)).toEqual([{ symbol: "usd", direction: "above", threshold: 0, indicator: "ma50", triggered: 1 }]);
  });

  it("fires on the daily run when the close crosses above its average, not on 30-minute runs", async () => {
    const d = db({ closes: flat(50, 2700000), latest: 2600000 });
    await say(d, "/alert usd > ma50");
    expect(alerts(d)[0].triggered).toBe(0);

    setLatest(d, "price_dollar_rl", 2800000);
    const sent = captureSends();
    await evaluatePriceAlerts(d, { TELEGRAM_BOT_TOKEN: "test" });
    expect(sent).toEqual([]);

    await evaluatePriceAlerts(d, { TELEGRAM_BOT_TOKEN: "test" }, { daily: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("میانگین ۵۰ روزه");
    expect(alerts(d)[0].triggered).toBe(1);
  });

  it("re-arms when the close falls back below the average", async () => {
    const d = db({ closes: flat(50, 2700000), latest: 2800000 });
    await say(d, "/alert usd > ma50");
    setLatest(d, "price_dollar_rl", 2600000);
    captureSends();
    await evaluatePriceAlerts(d, { TELEGRAM_BOT_TOKEN: "test" }, { daily: true });
    expect(alerts(d)[0].triggered).toBe(0);
  });

  it("lists indicator alerts by their indicator", async () => {
    const d = db({ closes: flat(200, 2700000), latest: 2600000 });
    await say(d, "/alert usd > ma200");
    expect(await say(d, "/alerts")).toBe("#۱: usd > ma200");
  });
});
