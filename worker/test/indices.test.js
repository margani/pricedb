// #246: TEDPIX in the API under its own "points" base
import { describe, expect, it } from "vitest";
import { change, history, latest, symbols } from "../src/api";
import { isSupportedPair } from "../src/symbols";
import { sqliteDb } from "./sqlite";

const MIGRATIONS = ["0001_init.sql", "0002_alerts.sql", "0003_price_alerts.sql", "0004_usage.sql", "0005_rial_prices.sql", "0006_backfill_daily.sql", "0007_indicator_alerts.sql", "0008_backfill_tedpix.sql"];
const NOW = new Date("2026-11-01T12:00:00Z");

function db() {
  const d = sqliteDb(MIGRATIONS);
  d.sqlite
    .prepare("INSERT INTO latest (symbol, ts, price, high, low, raw, fetched_at) VALUES ('bourse', ?1, 7660257.4, 7691112.4, 7656397.6, '', ?1)")
    .run(NOW.toISOString());
  return d;
}

describe("TEDPIX in the API", () => {
  it("pairs only with the points base", () => {
    expect(isSupportedPair("tedpix", "points")).toBe(true);
    expect(isSupportedPair("tedpix", "irr")).toBe(false);
    expect(isSupportedPair("usd", "tedpix")).toBe(false);
    expect(isSupportedPair("usd", "points")).toBe(false);
  });

  it("serves the latest index value in points", async () => {
    const response = await latest(db(), { symbol: "tedpix", base: "points" });
    expect(response.status).toBe(200);
    expect((await response.json()).price).toBe(7660257.4);
  });

  it("serves its daily history and change", async () => {
    const d = db();
    const h = await (await history(d, { symbol: "tedpix", base: "points" }, new URLSearchParams("from=2026-10-25&to=2026-10-31"), NOW)).json();
    expect(h.result.map((r) => r.price)).toContain(7927330.57);
    const c = await (await change(d, { symbol: "tedpix", base: "points" }, new URLSearchParams("period=7d"), NOW)).json();
    expect(c.price).toBe(7660257.4);
    expect(c.changes[0].changePercent).toBeLessThan(0);
  });

  it("is listed as an index in /v1/symbols, not among the rial symbols", async () => {
    const body = await symbols().json();
    expect(body.symbols).not.toContain("tedpix");
    expect(body.indices).toEqual([{ symbol: "tedpix", base: "points" }]);
  });
});
