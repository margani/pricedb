import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { backfillStatements, missingDays, parseHistoryRow, tehranDay } from "./tgju-history.mjs";

const row = (o, l, h, c, date) => [o, l, h, c, "", "", "", date];

describe("tgju daily history backfill (#186)", () => {
  it("reads close as the price and the extremes as high/low, even with swapped columns", () => {
    expect(parseHistoryRow(row("2,983,800", "2,980,200", "3,002,900", "2,990,100", "2026-10-08"))).toEqual({
      date: "2026-10-08", price: 2990100, high: 3002900, low: 2980200,
    });
    // oil_brent as tgju returned it on 2026-10-08: "high" below "low"
    expect(parseHistoryRow(row("101.0310", "100.20", "99.5560", "103.3560", "2026-10-08"))).toEqual({
      date: "2026-10-08", price: 103.356, high: 103.356, low: 99.556,
    });
    // price_dollar_rl as tgju returned it: Gregorian with slashes, Jalali last
    expect(parseHistoryRow(["2,656,850", "2,652,000", "2,682,000", "2,662,000", "", "", "2026/10/08", "1405/07/16"])).toEqual({
      date: "2026-10-08", price: 2662000, high: 2682000, low: 2652000,
    });
    expect(parseHistoryRow(row("x", "1", "1", "1", "2026-10-08"))).toBeNull();
    expect(parseHistoryRow(["1", "1", "1", "1", "", "", "1405/07/16", "1405/07/16"])).toBeNull();
  });

  it("uses Tehran days", () => {
    expect(tehranDay("2026-10-08T20:29:59.000Z")).toBe("2026-10-08");
    expect(tehranDay("2026-10-08T20:30:00.000Z")).toBe("2026-10-09");
  });

  it("keeps only days in range that we don't have", () => {
    const history = [row("1", "1", "1", "1", "2026-05-01"), row("2", "2", "2", "2", "2026-05-02"), row("3", "3", "3", "3", "2026-10-09")];
    const days = missingDays(history, new Set(["2026-05-01"]), "2023-12-02", "2026-10-08").map((d) => d.date);
    expect(days).toEqual(["2026-05-02"]);
  });

  it("inserts a missing day once and never touches a day that has a record", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync(new URL("../worker/migrations/0001_init.sql", import.meta.url), "utf8"));
    // Already recorded on 2026-05-03 Tehran (late evening UTC of 05-02 is 05-03 in Tehran)
    db.prepare("INSERT INTO prices VALUES ('price_eur', 'daily', '2026-05-02T21:00:00.000Z', 111, 111, 111, '{}')").run();

    // A batch size of 1 also exercises more than one statement
    const sql = backfillStatements("price_eur", [
      { date: "2026-05-02", price: 2990100, high: 3002900, low: 2980200 },
      { date: "2026-05-03", price: 999, high: 999, low: 999 },
    ], 1).join("\n");
    db.exec(sql);
    db.exec(sql); // a second run changes nothing

    const rows = db.prepare("SELECT ts, price, high, low, raw FROM prices WHERE symbol = 'price_eur' ORDER BY ts").all().map((r) => ({ ...r }));
    expect(rows).toEqual([
      { ts: "2026-05-02T13:30:00.000Z", price: 2990100, high: 3002900, low: 2980200, raw: '{"p":"2,990,100","h":"3,002,900","l":"2,980,200","ts":"2026-05-02 17:00:00"}' },
      { ts: "2026-05-02T21:00:00.000Z", price: 111, high: 111, low: 111, raw: "{}" },
    ]);
  });
});
