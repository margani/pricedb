import { describe, expect, it, vi } from "vitest";
import { nextAlertState, sendTelegram } from "../src/alerts";
import { badgeColor, formatValue, renderBadge } from "../src/badge";
import { handleMessage, mcp } from "../src/mcp";
import { divergence, secondSourceRow } from "../src/second-source";
import { reportText, sendDailyReport } from "../src/report";
import { alertMessage, evaluate } from "../src/price-alerts";
import { handleUpdate, parseCommand, parseNumber as parseBotNumber, telegramWebhook } from "../src/telegram-bot";
import { dailyFeed, historyCsv } from "../src/feed";
import { buildHistory, buildOhlc, crossRate, healthStatus, parsePeriods, priceChange, sameDayYearsAgo } from "../src/api";
import { formatDate, renderCandlestickChart, renderLineChart, yTicks } from "../src/chart";
import { ROUTES, cacheKey } from "../src/index";
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

    await runUpdate(db, "hourly", { fetchPrices: async () => allTracked(record("100")), fetchSecond: async () => null, now: () => NOW });

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
  it("changes with every deploy, so cached answers don't outlive it", () => {
    const url = new URL("https://api.priceto.day/v1/symbols");
    const before = cacheKey(url, [], "aaa111").url;
    const after = cacheKey(url, [], "bbb222").url;
    expect(before).not.toBe(after);
    expect(after).toBe("https://api.priceto.day/v1/symbols?deploy=bbb222");
  });

  it("keeps only the route's params, sorted", () => {
    const key = cacheKey(new URL("https://api.priceto.day/v1/history/irr/usd?x=1&to=b&from=a"), ["from", "to"]);

    expect(key.url).toBe("https://api.priceto.day/v1/history/irr/usd?from=a&to=b");
  });

  it.each(["/v1/change/irr/usd?period=1d", "/v1/chart/irr/usd?format=svg"])(
    "keys %s by the data version, so the live prices page gets fresh data (#198)",
    (path) => {
      const url = (v) => new URL(`https://priceto.day${path}&v=${v}`);
      const route = ROUTES.find((r) => r.pattern.test(url("a")));
      expect(route).toBeDefined();
      const before = cacheKey(url("2026-10-12T11:42:36.000Z"), route.params).url;
      const after = cacheKey(url("2026-10-12T12:12:36.000Z"), route.params).url;
      expect(before).toContain("v=2026-10-12T11%3A42%3A36.000Z");
      expect(before).not.toBe(after);
    }
  );
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
      "aed",
      "try",
      "cny",
      "cad",
      "aud",
      "gold-18k",
      "gold-24k",
      "coin-emami-market",
      "coin-baharazadi-market",
      "coin-baharazadi-nim-market",
      "coin-baharazadi-rob-market",
      "coin-gerami-market",
      "bitcoin",
      "tether",
      "ethereum",
      "gold-ounce",
      "silver-ounce",
      "brent",
    ]);
  });

  it.each([
    ["usd", "irr", true],
    ["coin-emami", "usd", true],
    ["usd", "gold-miskal", true],
    ["usd", "usd", false],
    ["irr", "usd", false],
    ["doge", "irr", false],
    ["gold-ounce", "usd", true],
    ["coin-emami-market", "irr", true],
    ["ethereum", "bitcoin", true],
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

  it("doesn't repeat date labels on short ranges", () => {
    const svg = renderLineChart([{ time: day(1), value: 1 }, { time: day(3), value: 2 }]);

    expect(svg.match(/>Oct 1</g)).toHaveLength(1);
  });

  it("carries the site's domain, so a chart shared or shown alone says where it came from", () => {
    expect(renderLineChart([{ time: day(1), value: 1 }], { title: "USD" })).toContain(">priceto.day</text>");
    expect(renderLineChart([])).toContain(">priceto.day</text>");
    expect(renderCandlestickChart([{ time: day(1), open: 1, high: 2, low: 0.5, close: 1.5 }])).toContain(">priceto.day</text>");
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

describe("buildOhlc", () => {
  it("uses the first and last hourly price of each Tehran day", () => {
    const row = (ts, price, high, low) => ({ ts, price, high, low });
    expect(
      buildOhlc([
        row("2026-10-01T06:00:00.000Z", 100, 101, 99),
        row("2026-10-01T10:00:00.000Z", 105, 108, 98),
        row("2026-10-01T16:00:00.000Z", 103, 108, 97),
        row("2026-10-01T21:00:00.000Z", 110, 111, 109),
      ])
    ).toEqual([
      { time: "2026-10-01T00:00:00.000Z", open: 100, high: 108, low: 97, close: 103 },
      { time: "2026-10-02T00:00:00.000Z", open: 110, high: 111, low: 109, close: 110 },
    ]);
  });
});

describe("mcp", () => {
  const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, params });

  it("negotiates the protocol version", async () => {
    expect((await handleMessage(null, rpc("initialize", { protocolVersion: "2025-06-18" }))).result.protocolVersion).toBe("2025-06-18");
    expect((await handleMessage(null, rpc("initialize", { protocolVersion: "1999-01-01" }))).result.protocolVersion).toBe("2025-11-25");
  });

  it("lists tools without their implementations", async () => {
    const { tools } = (await handleMessage(null, rpc("tools/list"))).result;

    expect(tools.map((t) => t.name)).toEqual(["list_symbols", "get_latest_price", "get_price_history", "get_price_change", "convert"]);
    expect(tools.every((t) => t.inputSchema && !t.run)).toBe(true);
  });

  it("calls a tool", async () => {
    const reply = await handleMessage(null, rpc("tools/call", { name: "list_symbols", arguments: {} }));

    expect(reply.result.isError).toBe(false);
    expect(JSON.parse(reply.result.content[0].text).symbols).toContain("usd");
  });

  it("reports tool errors as results", async () => {
    const reply = await handleMessage(null, rpc("tools/call", { name: "get_latest_price", arguments: { symbol: "doge" } }));

    expect(reply.result.isError).toBe(true);
  });

  it("rejects unknown tools and methods", async () => {
    expect((await handleMessage(null, rpc("tools/call", { name: "nope" }))).error.code).toBe(-32602);
    expect((await handleMessage(null, rpc("resources/list"))).error.code).toBe(-32601);
  });

  it("accepts notifications with 202", async () => {
    const response = await mcp(new Request("https://x/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }), null);

    expect(response.status).toBe(202);
  });

  it("returns a parse error for invalid JSON", async () => {
    const response = await mcp(new Request("https://x/mcp", { method: "POST", body: "{" }), null);

    expect((await response.json()).error.code).toBe(-32700);
  });
});

describe("second source", () => {
  it("converts a Bitpin toman ticker to a rial row", () => {
    const row = secondSourceRow({ symbol: "USDT_IRT", price: "267747", high: "270448", low: "262910", timestamp: 1791027000.5 }, NOW);

    expect(row).toMatchObject({ symbol: "bitpin:usdt", price: 2677470, high: 2704480, low: 2629100 });
    expect(row.ts).toBe("2026-10-03T11:30:00.500Z");
  });

  it("rejects missing or invalid tickers", () => {
    expect(secondSourceRow(undefined, NOW)).toBeNull();
    expect(secondSourceRow({ price: "0", high: "1", low: "1" }, NOW)).toBeNull();
  });

  it("measures divergence relative to the average", () => {
    expect(divergence(2713000, 2696680)).toBeCloseTo(0.006, 3);
    expect(divergence(110, 90)).toBeCloseTo(0.2, 5);
  });
});

describe("runUpdate second source", () => {
  const telegram = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "42" };
  const prices = () => ({ ...allTracked(record("100")), price_dollar_rl: record("2,700,000") });

  it("alerts when tgju and Bitpin disagree by more than 5%", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchImpl);
    const db = fakeDb({ first: { latest_data_at: NOW.toISOString() } });

    await runUpdate(db, "hourly", {
      env: telegram,
      fetchPrices: async () => prices(),
      fetchSecond: async () => ({ price: "300000", high: "300000", low: "300000" }),
      now: () => NOW,
    });

    const texts = fetchImpl.mock.calls.map((c) => JSON.parse(c[1].body).text);
    expect(texts.some((t) => t.includes("differ by 10.5%"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("keeps the tgju update when Bitpin fails", async () => {
    const db = fakeDb({ first: { latest_data_at: NOW.toISOString() } });

    await runUpdate(db, "hourly", {
      fetchPrices: async () => prices(),
      fetchSecond: async () => Promise.reject(new Error("down")),
      now: () => NOW,
    });

    expect(db.calls.find((c) => c.sql?.includes("INSERT INTO runs")).args[3]).toBe(1);
  });
});

describe("daily report", () => {
  it("lists prices in toman with changes and last year's dollar", () => {
    const text = reportText({
      now: NOW,
      prices: [
        { symbol: "usd", name: "دلار", price: 2713000, refs: { روز: 2679000, هفته: null } },
        { symbol: "euro", name: "یورو", price: 3025400, refs: { روز: 3025400, هفته: null } },
      ],
      yearAgo: 1141300,
    });

    expect(text).toContain("دلار: ۲۷۱٬۳۰۰ تومان (روز ▲۱٫۳٪)");
    expect(text).toContain("یورو: ۳۰۲٬۵۴۰ تومان (روز ●۰٪)");
    expect(text).toContain("دلار یک سال پیش: ۱۱۴٬۱۳۰ تومان");
    expect(text).toContain("شنبه ۱۱ مهر ۱۴۰۵");
  });

  it("does nothing without the bot secrets", async () => {
    expect(await sendDailyReport(null, {})).toBe(false);
  });
});

describe("price alerts", () => {
  const alert = (direction, threshold, triggered = 0) => ({ id: 1, chat_id: "7", symbol: "usd", direction, threshold, triggered });

  it("fires once when the threshold is crossed and re-arms when the price moves back", () => {
    expect(evaluate([alert("above", 2800000)], { usd: 2810000 }).fire).toHaveLength(1);
    expect(evaluate([alert("above", 2800000, 1)], { usd: 2810000 })).toEqual({ fire: [], rearm: [] });
    expect(evaluate([alert("above", 2800000, 1)], { usd: 2790000 }).rearm).toHaveLength(1);
    expect(evaluate([alert("below", 2500000)], { usd: 2400000 }).fire).toHaveLength(1);
  });

  it("formats the notification in toman", () => {
    expect(alertMessage({ ...alert("above", 2800000), price: 2813000 })).toContain("۲۸۱٬۳۰۰ تومان");
  });
});

describe("telegram bot", () => {
  it("parses commands, including /cmd@bot in groups", () => {
    expect(parseCommand("/alert@pricedb_bot usd > 1")).toEqual({ command: "alert", args: ["usd", ">", "1"] });
    expect(parseCommand("hello")).toBeNull();
  });

  it("parses Persian digits and separators", () => {
    expect(parseBotNumber("۲۸۰٬۰۰۰")).toBe(280000);
    expect(parseBotNumber("280,000")).toBe(280000);
    expect(parseBotNumber("abc")).toBeNaN();
  });

  it("rejects a malformed alert with usage help", async () => {
    const reply = await handleUpdate(null, { message: { chat: { id: 7 }, text: "/alert usd 280000" } });

    expect(reply).toContain("/alert usd > 280000");
  });

  it("stores an alert in rial", async () => {
    const calls = [];
    const db = {
      prepare: (sql) => ({
        bind: (...args) => ({
          first: async () => {
            calls.push({ sql, args });
            return sql.startsWith("SELECT COUNT") ? { count: 0 } : { id: 5 };
          },
        }),
      }),
    };

    const reply = await handleUpdate(db, { message: { chat: { id: 7 }, text: "/alert usd > ۲۸۰٬۰۰۰" } }, NOW);

    expect(calls[1].args.slice(0, 4)).toEqual(["7", "usd", "above", 2800000]);
    expect(reply).toContain("هشدار #۵");
  });

  it("ignores non-command messages", async () => {
    expect(await handleUpdate(null, { message: { chat: { id: 7 }, text: "hi" } })).toBeNull();
  });

  it("rejects webhook calls without the secret", async () => {
    const env = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_WEBHOOK_SECRET: "s" };
    const request = (secret) =>
      new Request("https://x/telegram/webhook", { method: "POST", headers: secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {}, body: "{}" });

    expect((await telegramWebhook(request(), env)).status).toBe(403);
    expect((await telegramWebhook(request("wrong"), env)).status).toBe(403);
    expect((await telegramWebhook(request("s"), env)).status).toBe(200);
  });
});
