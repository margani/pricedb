// #251: one dataset file per Persian year
import { describe, expect, it } from "vitest";
import { dataset } from "../src/api";
import { persianYearRange } from "../src/time";
import { sqliteDb } from "./sqlite";

const MIGRATIONS = ["0001_init.sql", "0002_alerts.sql", "0003_price_alerts.sql", "0004_usage.sql", "0005_rial_prices.sql", "0006_backfill_daily.sql", "0007_indicator_alerts.sql", "0008_backfill_tedpix.sql"];

const csvRows = async (response) => (await response.text()).trim().split("\n").slice(1);

describe("Persian years", () => {
  it("start at Tehran midnight of Nowruz", () => {
    expect(persianYearRange(1402)).toEqual({ from: "2023-03-20T20:30:00.000Z", to: "2024-03-19T20:30:00.000Z" });
    expect(persianYearRange(1403).from).toBe("2024-03-19T20:30:00.000Z");
    expect(persianYearRange(1405)).toEqual({ from: "2026-03-20T20:30:00.000Z", to: "2027-03-20T20:30:00.000Z" });
    expect(persianYearRange(99)).toBeNull();
  });
});

describe("dataset ?year=", () => {
  it("returns only that year's rows, and the years add up to the whole file", async () => {
    const db = sqliteDb(MIGRATIONS);
    const all = await csvRows(dataset(db, "daily.csv"));
    expect(all.length).toBeGreaterThan(0);
    let total = 0;
    for (const year of [1402, 1403, 1404, 1405]) {
      const response = dataset(db, "daily.csv", new URLSearchParams(`year=${year}`));
      expect(response.headers.get("Content-Disposition")).toContain(`prices-daily-${year}.csv`);
      const rows = await csvRows(response);
      const { from, to } = persianYearRange(year);
      expect(rows.every((r) => { const ts = r.split(",")[1]; return ts >= from && ts < to; })).toBe(true);
      total += rows.length;
    }
    expect(total).toBe(all.length);
  });

  it("rejects a year that is not a Persian year", async () => {
    expect(dataset(sqliteDb(MIGRATIONS), "daily.csv", new URLSearchParams("year=abc")).status).toBe(400);
    expect(dataset(sqliteDb(MIGRATIONS), "daily.csv", new URLSearchParams("year=2025")).status).toBe(400);
  });
});
