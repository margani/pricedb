import { describe, expect, it, vi } from "vitest";
import { nextAlertState, sendTelegram } from "../src/alerts";
import { badgeColor, formatValue, renderBadge } from "../src/badge";
import { dailyFeed, historyCsv } from "../src/feed";
import { buildHistory, crossRate, healthStatus, parsePeriods, priceChange, sameDayYearsAgo } from "../src/api";
import { formatDate, renderCandlestickChart, renderLineChart, yTicks } from "../src/chart";
import { cacheKey } from "../src/index";
import { API_SYMBOLS, TRACKED_SYMBOLS, isSupportedPair } from "../src/symbols";
import { fetchCurrentPrices, parseNumber, selectRows, toPriceRow } from "../src/tgju";
import { parseDateParam, parseTehranTimestamp, toTehranDay } from "../src/time";
import { runUpdate } from "../src/update";

const NOW = new Date("2026-10-03T12:00:00Z");
const record = (p, h = p, l = p, ts = "2026-10-03 15:00:00") => ({ p, h, l, ts });

describe("time", () => {
  it("parses tgju timestamps as UTC+03:30", () => {
    expect(parseTehranTimestamp("2026-10-01 19:59:54").toJSON()).toBe("2026-10-01T16:29:54.000Z");
    expect(parseTehranTimestamp("2026-10-01")).toBeNull();
  });

  it("buckets instants by Tehran calendar day", () => {
    expect(toTehranDay(new Date("2026-10-01T20:29:59Z")).toJSON()).toBe("2026-10-01T00:00:00.000Z");
    expect(toTehranDay(new Date("2026-10-01T20:30:00Z")).toJSON()).toBe("2026-10-02T00:00:00.000Z");
  });

  it("falls back for missing or invalid date params", () => {
    expect(parseDateParam(null, NOW)).toBe(NOW);
    expect(parseDateParam("not a date", NOW)).toBe(NOW);
    expect(parseDateParam("2026-01-01", NOW).toJSON()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("tgju", () => {
  it("parses formatted numbers", () => {
    expect(parseNumber("2,584,650")).toBe(2584650);
    expect(parseNumber("1.00000000")).toBe(1);
    expect(parseNumber("")).toBeNaN();
    expect(parseNumber(undefined)).toBeNaN();
  });

  it("converts a valid record and keeps the original fields", () => {
    const { row } = toPriceRow("price_dollar_rl", record("2,679,000", "2,685,200", "2,650,600"), NOW);

    expect(row).toEqual({
      symbol: "price_dollar_rl",
      ts: "2026-10-03T11:30:00.000Z",
      price: 2679000,
      high: 2685200,
      low: 2650600,
      raw: '{"p":"2,679,000","h":"2,685,200","l":"2,650,600","ts":"2026-10-03 15:00:00"}',
    });
  });

  it.each([
    ["missing", undefined],
    ["non-positive price", record("-1")],
    ["non-numeric price", record("abc")],
    ["bad timestamp", { ...record("1"), ts: "yesterday" }],
    ["timestamp in the future", record("1", "1", "1", "2026-10-03 23:00:00")],
  ])("rejects a %s record", (_, value) => {
    expect(toPriceRow("x", value, NOW).error).toBeTruthy();
  });

  it("selects tracked symbols and reports invalid ones", () => {
    const { rows, invalid } = selectRows({ a: record("1"), b: record("-1"), c: record("2") }, ["a", "b", "missing"], NOW);

    expect(rows.map((r) => r.symbol)).toEqual(["a"]);
    expect(invalid.map((i) => i.symbol)).toEqual(["b", "missing"]);
  });

  it("retries failed requests", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ current: { a: 1 } }) });

    await expect(fetchCurrentPrices({ fetchImpl, delayMs: 0 })).resolves.toEqual({ a: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last attempt", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));

    await expect(fetchCurrentPrices({ fetchImpl, attempts: 2, delayMs: 0 })).rejects.toThrow("down");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

// Records statements instead of running them
function fakeDb({ runs = [], first = null } = {}) {
  const calls = [];
  const bound = (sql, args) => ({
    sql,
    args,
    run: async () => calls.push({ sql, args }),
    all: async () => ({ results: sql.includes("FROM runs") ? runs : [] }),
    first: async () => first,
  });
  const statement = (sql) => ({ ...bound(sql, []), bind: (...args) => bound(sql, args) });
  return {
    calls,
    prepare: statement,
    batch: async (statements) => calls.push({ batch: statements }),
  };
}

const allTracked = (value) => Object.fromEntries(TRACKED_SYMBOLS.map((symbol) => [symbol, value]));

describe("runUpdate", () => {
  it("saves rows to the requested history and records a successful run", async () => {
    const db = fakeDb();

    await runUpdate(db, "hourly", { fetchPrices: async () => allTracked(record("100")), now: () => NOW });

    const batch = db.calls.find((c) => c.batch).batch;
    expect(batch).toHaveLength(TRACKED_SYMBOLS.length * 2);
    expect(batch[1].args.slice(0, 2)).toEqual([TRACKED_SYMBOLS[0], "hourly"]);
    const run = db.calls.find((c) => c.sql?.includes("INSERT INTO runs"));
    expect(run.args.slice(3, 5)).toEqual([1, TRACKED_SYMBOLS.length]);
  });

  it("fails without saving when most symbols are invalid", async () => {
    const db = fakeDb();

    await expect(
      runUpdate(db, "daily", { fetchPrices: async () => allTracked(record("-1")), now: () => NOW })
    ).rejects.toThrow("invalid");

    expect(db.calls.some((c) => c.batch)).toBe(false);
    const run = db.calls.find((c) => c.sql?.includes("INSERT INTO runs"));
    expect(run.args[3]).toBe(0);
  });

  it("records the error when tgju is unreachable", async () => {
    const db = fakeDb();

    await expect(
      runUpdate(db, "hourly", { fetchPrices: async () => Promise.reject(new Error("down")), now: () => NOW })
    ).rejects.toThrow("down");

    expect(db.calls.find((c) => c.sql?.includes("INSERT INTO runs")).args[6]).toBe("down");
  });
});

describe("api", () => {
  const row = (price, ts, high = price, low = price) => ({ price, high, low, ts });

  it("computes the widest range for cross rates", () => {
    expect(crossRate({ price: 1000, high: 1200, low: 900 }, { price: 100, high: 110, low: 90 })).toEqual({
      price: 10,
      high: 1200 / 90,
      low: 900 / 110,
    });
  });

  it("returns IRR history as daily points", () => {
    expect(buildHistory([row(100, "2026-09-20T15:30:00.000Z")], null)).toEqual([
      { price: 100, high: 100, low: 100, time: "2026-09-20T00:00:00.000Z" },
    ]);
  });

  it("pairs cross rates with the closest same-day record", () => {
    const symbolRows = [row(1000, "2026-09-20T06:00:00.000Z"), row(2000, "2026-09-20T16:00:00.000Z")];
    const baseRows = [row(100, "2026-09-20T16:05:00.000Z"), row(100, "2026-09-21T16:00:00.000Z")];

    expect(buildHistory(symbolRows, baseRows).map((p) => p.price)).toEqual([20]);
  });

  it.each([
    ["2026-10-03T11:00:00Z", "ok"],
    ["2026-10-03T10:00:00Z", "stale"],
    [null, "stale"],
  ])("reports health for last success %s", (lastSuccess, status) => {
    expect(healthStatus(lastSuccess, NOW)).toBe(status);
  });

  it("allows the overnight gap", () => {
    expect(healthStatus("2026-10-02T22:30:00Z", new Date("2026-10-03T03:30:00Z"))).toBe("ok");
  });
});

describe("cacheKey", () => {
  it("keeps only the route's params, sorted", () => {
    const key = cacheKey(new URL("https://api.priceto.day/v1/history/irr/usd?x=1&to=b&from=a"), ["from", "to"]);

    expect(key.url).toBe("https://api.priceto.day/v1/history/irr/usd?from=a&to=b");
  });
});

describe("alerts", () => {
  const at = (iso) => new Date(iso);

  it("notifies when an alert starts", () => {
    const next = nextAlertState(null, true, "boom", at("2026-10-03T10:00:00Z"));

    expect(next.notify).toBe("🔴 pricedb: boom");
    expect(next.state).toMatchObject({ active: 1, since: "2026-10-03T10:00:00.000Z" });
  });

  it("stays quiet while active, then reminds after 6 hours", () => {
    const state = { active: 1, since: "2026-10-03T10:00:00.000Z", last_notified_at: "2026-10-03T10:00:00.000Z" };

    expect(nextAlertState(state, true, "boom", at("2026-10-03T15:00:00Z")).notify).toBeNull();
    expect(nextAlertState(state, true, "boom", at("2026-10-03T16:00:00Z")).notify).toBe(
      "🔴 pricedb: still failing for 6 h: boom"
    );
  });

  it("notifies on recovery", () => {
    const state = { active: 1, since: "2026-10-03T10:00:00.000Z", last_notified_at: "2026-10-03T10:00:00.000Z", message: "boom" };
    const next = nextAlertState(state, false, "", at("2026-10-03T10:45:00Z"));

    expect(next.notify).toBe("✅ pricedb: recovered after 45 min (boom)");
    expect(next.state.active).toBe(0);
  });

  it("does nothing when healthy", () => {
    expect(nextAlertState(null, false, "", at("2026-10-03T10:00:00Z"))).toEqual({ notify: null, state: null });
  });

  it("skips Telegram until the secrets are set", async () => {
    const fetchImpl = vi.fn();

    expect(await sendTelegram({}, "hi", fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts to the configured chat", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });

    await sendTelegram({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "42" }, "hi", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("https://api.telegram.org/bott/sendMessage", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ chat_id: "42", text: "hi" });
  });
});

describe("runUpdate alerts", () => {
  const telegram = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "42" };

  it("alerts after two failed runs in a row", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchImpl);
    const db = fakeDb({ runs: [{ ok: 0 }, { ok: 0 }], first: { latest_data_at: NOW.toISOString() } });

    await expect(
      runUpdate(db, "hourly", { env: telegram, fetchPrices: async () => Promise.reject(new Error("down")), now: () => NOW })
    ).rejects.toThrow("down");

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).text).toBe("🔴 pricedb: price update failed: down");
    vi.unstubAllGlobals();
  });

  it("stays quiet after a single failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchImpl);
    const db = fakeDb({ runs: [{ ok: 0 }, { ok: 1 }], first: { latest_data_at: NOW.toISOString() } });

    await expect(
      runUpdate(db, "hourly", { env: telegram, fetchPrices: async () => Promise.reject(new Error("down")), now: () => NOW })
    ).rejects.toThrow("down");

    expect(fetchImpl).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("change", () => {
  it("parses periods into days", () => {
    expect(parsePeriods("1d, 2W,3m,1y")).toEqual([
      { period: "1d", days: 1 },
      { period: "2w", days: 14 },
      { period: "3m", days: 90 },
      { period: "1y", days: 365 },
    ]);
  });

  it("uses the default periods", () => {
    expect(parsePeriods(null).map((p) => p.period)).toEqual(["1d", "7d", "30d", "1y"]);
  });

  it.each(["0d", "1h", "abc", "11y", Array(11).fill("1d").join(",")])("rejects %s", (value) => {
    expect(parsePeriods(value)).toBeNull();
  });

  it("computes absolute and percentage change", () => {
    expect(priceChange(110, 100)).toEqual({ change: 10, changePercent: 10 });
    expect(priceChange(75, 100)).toEqual({ change: -25, changePercent: -25 });
  });
});

describe("badge", () => {
  it("formats the value with rounding, precision and unit", () => {
    expect(formatValue(2679000, 1, 0, "Toman")).toBe("267,900 Toman");
    expect(formatValue(2679000, 4, 1)).toBe("267.9");
  });

  it("accepts named and hex colors only", () => {
    expect(badgeColor("green")).toBe("#4c1");
    expect(badgeColor("ff0000")).toBe("#ff0000");
    expect(badgeColor("javascript:alert(1)")).toBe("#007ec6");
  });

  it("escapes label and value", () => {
    const svg = renderBadge("<b>", "1 & 2", "#4c1");

    expect(svg).toContain("&lt;b&gt;");
    expect(svg).toContain("1 &amp; 2");
    expect(svg).not.toContain("<b>");
  });
});

describe("sameDayYearsAgo", () => {
  it("returns the same calendar day", () => {
    expect(sameDayYearsAgo(new Date("2026-10-04T00:00:00Z"), [1, 5]).map((t) => t.day.toJSON())).toEqual([
      "2025-10-04T00:00:00.000Z",
      "2021-10-04T00:00:00.000Z",
    ]);
  });

  it("maps Feb 29 to Feb 28 in non-leap years", () => {
    expect(sameDayYearsAgo(new Date("2028-02-29T00:00:00Z"), [1])[0].day.toJSON()).toBe("2027-02-28T00:00:00.000Z");
  });
});

describe("feed", () => {
  it("renders history as CSV", () => {
    expect(historyCsv([{ time: "2026-10-01T00:00:00.000Z", price: 1, high: 2, low: 0.5 }])).toBe(
      "time,price,high,low\n2026-10-01T00:00:00.000Z,1,2,0.5\n"
    );
  });

  it("builds one item per Tehran day, newest first, with the last price of the day", () => {
    const xml = dailyFeed([
      { symbol: "price_dollar_rl", ts: "2026-09-30T16:00:00.000Z", price: 2500000 },
      { symbol: "price_dollar_rl", ts: "2026-10-01T10:00:00.000Z", price: 2580000 },
      { symbol: "price_dollar_rl", ts: "2026-10-01T16:00:00.000Z", price: 2584650 },
      { symbol: "mesghal", ts: "2026-10-01T16:00:00.000Z", price: 1135960000 },
    ]);

    expect(xml.indexOf("Prices on 2026-10-01")).toBeLessThan(xml.indexOf("Prices on 2026-09-30"));
    expect(xml).toContain("USD: 258,465 Toman · Gold miskal: 113,596,000 Toman");
    expect(xml).not.toContain("258,000 Toman");
  });
});

describe("symbols", () => {
  it("keeps the public symbol order", () => {
    expect(API_SYMBOLS).toEqual([
      "irr",
      "usd",
      "gbp",
      "euro",
      "gold-miskal",
      "coin-emami",
      "coin-baharazadi",
      "coin-baharazadi-nim",
      "coin-baharazadi-rob",
      "coin-gerami",
    ]);
  });

  it.each([
    ["usd", "irr", true],
    ["coin-emami", "usd", true],
    ["usd", "gold-miskal", true],
    ["usd", "usd", false],
    ["irr", "usd", false],
    ["doge", "irr", false],
  ])("%s in %s supported: %s", (symbol, base, expected) => {
    expect(isSupportedPair(symbol, base)).toBe(expected);
  });
});

describe("chart", () => {
  const day = (d) => `2026-10-${String(d).padStart(2, "0")}T00:00:00.000Z`;

  it("picks readable y-axis ticks", () => {
    expect(yTicks(1663300, 2685200)).toEqual([1500000, 1750000, 2000000, 2250000, 2500000, 2750000]);
    expect(yTicks(258.5, 258.5).length).toBeGreaterThan(1);
  });

  it("formats dates by span", () => {
    expect(formatDate(day(1), 30)).toBe("Oct 1");
    expect(formatDate(day(1), 400)).toBe("Oct 2026");
  });

  it("draws a line for many points without markers", () => {
    const points = Array.from({ length: 700 }, (_, i) => ({ time: new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString(), value: 1000 + i }));
    const svg = renderLineChart(points, { title: "USD" });

    expect(svg).toContain("<path");
    expect(svg).not.toContain("<circle");
  });

  it("labels a single point with its value", () => {
    expect(renderLineChart([{ time: day(1), value: 258.5 }], { precision: 1 })).toContain(">258.5</text>");
  });

  it("escapes the title and handles no data", () => {
    const svg = renderLineChart([], { title: "<x>" });

    expect(svg).toContain("&lt;x&gt;");
    expect(svg).toContain("No data");
  });

  it("colors rising and falling candles", () => {
    const svg = renderCandlestickChart([
      { time: day(1), open: 1, high: 3, low: 0.5, close: 2 },
      { time: day(2), open: 2, high: 2.5, low: 1, close: 1.5 },
    ]);

    expect(svg).toContain("#16a34a");
    expect(svg).toContain("#dc2626");
  });
});
