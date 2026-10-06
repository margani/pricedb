import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheHeaders,
  getChartImageUrl,
  getDataSource,
  getHistory,
  parseTehranTimestamp,
  toTehranDay,
} from "./index";
import chartConfig from "./chart-config.json";

const record = (p, h, l, ts) => ({ p, h, l, ts });

// Serves history.json fixtures keyed by the tgju name in the requested URL
function mockHistoryFiles(files) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      const name = Object.keys(files).find((key) => url.includes(`/${key}/`));
      return { json: async () => files[name] };
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("parseTehranTimestamp", () => {
  it("treats tgju timestamps as UTC+03:30", () => {
    expect(parseTehranTimestamp("2026-10-01 19:59:54").toJSON()).toBe("2026-10-01T16:29:54.000Z");
  });

  it("falls back to Date.parse for other formats", () => {
    expect(parseTehranTimestamp("2026-10-01T00:00:00Z").toJSON()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("toTehranDay", () => {
  it("keeps instants on the same Tehran day", () => {
    expect(toTehranDay(new Date("2026-10-01T16:29:54Z")).toJSON()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("moves late UTC instants to the next Tehran day", () => {
    expect(toTehranDay(new Date("2026-10-01T21:00:00Z")).toJSON()).toBe("2026-10-02T00:00:00.000Z");
  });
});

describe("getDataSource", () => {
  it("returns the source for a supported pair", () => {
    expect(getDataSource("usd", "irr")).not.toBeNull();
  });

  it("returns null for an unsupported pair", () => {
    expect(getDataSource("doge", "irr")).toBeNull();
  });
});

describe("getHistory", () => {
  beforeEach(() => {
    mockHistoryFiles({
      price_dollar_rl: [
        record("90", "95", "85", "2026-08-01 19:00:00"),
        record("100", "110", "90", "2026-09-20 19:00:00"),
        record("120", "125", "115", "2026-09-25 19:00:00"),
      ],
      retail_sekeb: [
        record("1,000", "1,200", "900", "2026-09-20 19:30:00"),
        record("1,500", "1,600", "1,400", "2026-09-24 19:30:00"),
      ],
    });
  });

  it("returns IRR prices within the range, bucketed by Tehran day", async () => {
    const history = await getHistory(getDataSource("usd", "irr"), "irr", "usd", "2026-09-01", "2026-10-01");

    expect(history).toEqual([
      { price: 100, high: 110, low: 90, time: "2026-09-20T00:00:00.000Z" },
      { price: 120, high: 125, low: 115, time: "2026-09-25T00:00:00.000Z" },
    ]);
  });

  it("defaults to the last 30 days", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-30T12:00:00Z"), toFake: ["Date"] });

    const history = await getHistory(getDataSource("usd", "irr"), "irr", "usd");

    expect(history.map((_) => _.price)).toEqual([100, 120]);
  });

  it("joins cross rates on matching days and returns the widest high/low range", async () => {
    const history = await getHistory(
      getDataSource("coin-baharazadi", "usd"),
      "usd",
      "coin-baharazadi",
      "2026-09-01",
      "2026-10-01"
    );

    expect(history).toEqual([
      { price: 10, high: 1200 / 90, low: 900 / 110, time: "2026-09-20T00:00:00.000Z" },
    ]);
  });
});

describe("getChartImageUrl", () => {
  const chartConfigOf = (url) => JSON.parse(decodeURIComponent(new URL(url).searchParams.get("c")));

  it("applies rounding and precision to prices", () => {
    const config = chartConfigOf(getChartImageUrl([{ price: 2584650, time: "2026-10-01T00:00:00.000Z" }], "USD", 4, 1));

    expect(config.data.datasets[0].data).toEqual(["258.5"]);
    expect(config.options.title.text).toBe("USD");
  });

  it("leaves the shared chart config untouched", () => {
    const before = JSON.stringify(chartConfig);

    getChartImageUrl([{ price: 1, time: "2026-10-01T00:00:00.000Z" }], "Title", 0, 0);

    expect(JSON.stringify(chartConfig)).toBe(before);
  });
});

describe("cacheHeaders", () => {
  it("varies the Netlify cache only on the given query params", () => {
    expect(cacheHeaders(1800, ["from", "to"])["Netlify-Vary"]).toBe("query=from|to");
  });

  it("ignores all query params by default", () => {
    expect(cacheHeaders()["Netlify-Vary"]).toBe("query=_");
  });
});
