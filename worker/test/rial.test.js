import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latest } from "../src/api";
import { datasetCsv } from "../src/dataset";
import { isSupportedPair } from "../src/symbols";
import { rialRows } from "../src/update";
import { sqliteDb } from "./sqlite";

const ALL_MIGRATIONS = ["0001_init.sql", "0002_alerts.sql", "0003_price_alerts.sql", "0004_usage.sql"];

function insert(db, table, rows) {
  for (const r of rows) {
    if (table === "prices") {
      db.sqlite
        .prepare("INSERT INTO prices (symbol, granularity, ts, price, high, low, raw) VALUES (?, ?, ?, ?, ?, ?, '{}')")
        .run(r.symbol, r.granularity, r.ts, r.price, r.high ?? r.price, r.low ?? r.price);
    } else {
      db.sqlite
        .prepare("INSERT INTO latest (symbol, ts, price, high, low, raw, fetched_at) VALUES (?, ?, ?, ?, ?, '{}', ?)")
        .run(r.symbol, r.ts, r.price, r.high ?? r.price, r.low ?? r.price, r.ts);
    }
  }
}

const migrate = (db, name) =>
  db.sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));

describe("rial copies of USD prices (#129)", () => {
  it("the migration backfills history and latest with the dollar at or before each record", () => {
    const db = sqliteDb(ALL_MIGRATIONS);
    insert(db, "prices", [
      { symbol: "ons", granularity: "daily", ts: "2026-10-01T10:00:00.000Z", price: 4000 }, // before any dollar: skipped
      { symbol: "price_dollar_rl", granularity: "daily", ts: "2026-10-02T10:00:00.000Z", price: 2_600_000 },
      { symbol: "ons", granularity: "daily", ts: "2026-10-02T12:00:00.000Z", price: 4100, high: 4150, low: 4050 },
      { symbol: "price_dollar_rl", granularity: "daily", ts: "2026-10-03T10:00:00.000Z", price: 2_700_000 },
      { symbol: "ons", granularity: "daily", ts: "2026-10-03T12:00:00.000Z", price: 4140.19 },
      { symbol: "price_eur", granularity: "daily", ts: "2026-10-03T12:00:00.000Z", price: 3_000_000 }, // not USD-priced
    ]);
    insert(db, "latest", [
      { symbol: "price_dollar_rl", ts: "2026-10-03T10:00:00.000Z", price: 2_700_000 },
      { symbol: "ons", ts: "2026-10-03T12:00:00.000Z", price: 4200 },
    ]);

    migrate(db, "0005_rial_prices.sql");

    const rows = db.sqlite.prepare("SELECT ts, price, high, low FROM prices WHERE symbol = 'irr:ons' ORDER BY ts").all();
    expect(rows.map((r) => ({ ...r }))).toEqual([
      { ts: "2026-10-02T12:00:00.000Z", price: 4100 * 2_600_000, high: 4150 * 2_600_000, low: 4050 * 2_600_000 },
      { ts: "2026-10-03T12:00:00.000Z", price: 11_178_513_000, high: 11_178_513_000, low: 11_178_513_000 },
    ]);
    expect(db.sqlite.prepare("SELECT COUNT(*) n FROM prices WHERE symbol LIKE 'irr:%' AND symbol <> 'irr:ons'").get().n).toBe(0);
    expect(db.sqlite.prepare("SELECT price FROM latest WHERE symbol = 'irr:ons'").get().price).toBe(4200 * 2_700_000);
  });

  it("an update prices USD symbols with its own dollar, or the last stored one", async () => {
    const db = sqliteDb(ALL_MIGRATIONS);
    const ons = { symbol: "ons", ts: "2026-10-09T13:00:00.000Z", price: 4189, high: 4200, low: 4180, raw: "{}" };
    const odd = { symbol: "silver", ts: ons.ts, price: 4140.19, high: 4140.19, low: 4140.19, raw: "{}" };

    const withUsd = await rialRows(db, [ons, { symbol: "price_dollar_rl", ts: "2026-10-09T13:00:00.000Z", price: 2_662_000 }]);
    expect(withUsd).toEqual([
      { symbol: "irr:ons", ts: ons.ts, price: 4189 * 2_662_000, high: 4200 * 2_662_000, low: 4180 * 2_662_000, raw: "" },
    ]);

    // Fridays: tgju sends the ounce but no new dollar
    insert(db, "latest", [{ symbol: "price_dollar_rl", ts: "2026-10-08T13:00:00.000Z", price: 2_663_950 }]);
    const fromDb = await rialRows(db, [ons]);
    expect(fromDb.map((r) => r.price)).toEqual([4189 * 2_663_950]);

    expect(await rialRows(sqliteDb(ALL_MIGRATIONS), [ons])).toEqual([]);
    // Whole rials, not 11178512999.999998
    const [silver] = await rialRows(db, [odd, { symbol: "price_dollar_rl", ts: ons.ts, price: 2_700_000 }]);
    expect(silver.price).toBe(11_178_513_000);
    expect(await rialRows(db, [{ symbol: "price_eur", ts: ons.ts, price: 1 }])).toEqual([]);
  });

  it("serves gold-ounce in rial and, through the dollar, in tgju's own USD price", async () => {
    const db = sqliteDb(ALL_MIGRATIONS);
    insert(db, "latest", [
      { symbol: "price_dollar_rl", ts: "2026-10-09T13:00:00.000Z", price: 2_662_000 },
      { symbol: "irr:ons", ts: "2026-10-09T13:00:00.000Z", price: 4189 * 2_662_000 },
    ]);

    expect(isSupportedPair("gold-ounce", "usd")).toBe(true);
    const inRial = await (await latest(db, { symbol: "gold-ounce", base: "irr" })).json();
    const inUsd = await (await latest(db, { symbol: "gold-ounce", base: "usd" })).json();
    expect(inRial.price).toBe(4189 * 2_662_000);
    expect(inUsd.price).toBeCloseTo(4189, 9);
  });

  it("leaves the rial copies out of the public dataset", async () => {
    const db = sqliteDb(ALL_MIGRATIONS);
    insert(db, "prices", [
      { symbol: "ons", granularity: "daily", ts: "2026-10-09T13:00:00.000Z", price: 4189 },
      { symbol: "irr:ons", granularity: "daily", ts: "2026-10-09T13:00:00.000Z", price: 11_151_118_000 },
    ]);
    const csv = await new Response(datasetCsv(db, "daily")).text();
    const lines = csv.trim().split("\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(1).map((l) => l.split(",")[0])).toEqual(["ons"]);
  });
});
