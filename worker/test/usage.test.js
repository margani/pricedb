import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

// usage.js caches the day's salt per isolate; a fresh module per test keeps
// one test's salt out of the next test's database
let getUsage, isCountedRequest, recordUsage, rollUpUsage;
beforeEach(async () => {
  vi.resetModules();
  ({ getUsage, isCountedRequest, recordUsage, rollUpUsage } = await import("../src/usage"));
});

// A minimal D1 stand-in over a real SQLite database, so the migration and the
// SQL in usage.js run for real
function sqliteDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../migrations/0004_usage.sql", import.meta.url), "utf8"));
  const bound = (sql, args) => ({
    run: async () => (sqlite.prepare(sql).run(...args), { success: true }),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  });
  return {
    sqlite,
    prepare: (sql) => ({ ...bound(sql, []), bind: (...args) => ({ ...bound(sql, args), sql, args }) }),
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(({ sql, args }) =>
          /^\s*select/i.test(sql) ? { results: sqlite.prepare(sql).all(...args) } : (sqlite.prepare(sql).run(...args), { results: [] })
        );
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const request = (path, ip, headers = {}) =>
  new Request(`https://api.priceto.day${path}`, { headers: { ...(ip ? { "CF-Connecting-IP": ip } : {}), ...headers } });

const DAY1 = new Date("2026-10-09T10:00:00Z");
const DAY2 = new Date("2026-10-10T01:00:00Z");

describe("isCountedRequest", () => {
  it("counts API calls from other sites and apps", () => {
    expect(isCountedRequest(request("/v1/latest/irr/usd"))).toBe(true);
    expect(isCountedRequest(request("/tgju/current/price_dollar_rl/latest.json"))).toBe(true);
    expect(isCountedRequest(new Request("https://api.priceto.day/mcp", { method: "POST" }))).toBe(true);
    expect(isCountedRequest(request("/v1/change/irr/usd", null, { "Sec-Fetch-Site": "cross-site" }))).toBe(true);
  });

  it("skips the landing page, its own API calls, monitoring and preflights", () => {
    expect(isCountedRequest(request("/"))).toBe(false);
    expect(isCountedRequest(request("/v1/change/irr/usd", null, { "Sec-Fetch-Site": "same-origin" }))).toBe(false);
    expect(isCountedRequest(request("/v1/health"))).toBe(false);
    expect(isCountedRequest(request("/v1/stats"))).toBe(false);
    expect(isCountedRequest(request("/v1/version"))).toBe(false);
    expect(isCountedRequest(new Request("https://api.priceto.day/v1/latest/irr/usd", { method: "OPTIONS" }))).toBe(false);
  });
});

describe("usage", () => {
  it("counts requests and distinct clients per day without storing IPs", async () => {
    const db = sqliteDb();
    await recordUsage(db, request("/v1/latest/irr/usd", "203.0.113.7"), DAY1);
    await recordUsage(db, request("/v1/latest/irr/eur", "203.0.113.7"), DAY1);
    await recordUsage(db, request("/v1/symbols", "2001:db8::1"), DAY1);

    const usage = await getUsage(db, DAY1);
    expect(usage.today).toEqual({ date: "2026-10-09", requests: 3, users: 2 });
    expect(usage.lastDays.requests).toBe(3);

    const stored = JSON.stringify([
      db.sqlite.prepare("SELECT * FROM usage_clients").all(),
      db.sqlite.prepare("SELECT * FROM usage_daily").all(),
    ]);
    expect(stored).not.toContain("203.0.113.7");
    expect(stored).not.toContain("2001:db8::1");
  });

  it("hashes the same IP differently on different days", async () => {
    const db = sqliteDb();
    await recordUsage(db, request("/v1/symbols", "203.0.113.7"), DAY1);
    await recordUsage(db, request("/v1/symbols", "203.0.113.7"), DAY2);

    const clients = db.sqlite.prepare("SELECT client FROM usage_clients ORDER BY day").all().map((r) => r.client);
    expect(clients).toHaveLength(2);
    expect(clients[0]).not.toBe(clients[1]);
  });

  it("keeps only the counts of finished days after the roll-up", async () => {
    const db = sqliteDb();
    await recordUsage(db, request("/v1/symbols", "203.0.113.7"), DAY1);
    await recordUsage(db, request("/v1/symbols", "198.51.100.2"), DAY1);
    await recordUsage(db, request("/v1/symbols", "198.51.100.2"), DAY2);

    await rollUpUsage(db, DAY2);

    expect(db.sqlite.prepare("SELECT day FROM usage_clients").all().map((r) => r.day)).toEqual(["2026-10-10"]);
    expect(db.sqlite.prepare("SELECT day FROM usage_salts").all().map((r) => r.day)).toEqual(["2026-10-10"]);
    const usage = await getUsage(db, DAY2);
    expect(usage.daily).toEqual([
      { date: "2026-10-09", requests: 2, users: 2 },
      { date: "2026-10-10", requests: 1, users: 1 },
    ]);
    expect(usage.today).toEqual({ date: "2026-10-10", requests: 1, users: 1 });
    expect(usage.lastDays.requests).toBe(3);
  });

  it("only sums the last 30 days", async () => {
    const db = sqliteDb();
    db.sqlite.exec("INSERT INTO usage_daily (day, requests, users) VALUES ('2026-09-09', 500, 9), ('2026-09-10', 40, 4)");
    const usage = await getUsage(db, DAY1);
    expect(usage.lastDays).toEqual({ days: 30, from: "2026-09-10", requests: 40 });
    expect(usage.today).toEqual({ date: "2026-10-09", requests: 0, users: 0 });
  });
});
