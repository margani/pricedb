// Regression tests for #226: bounded MCP batches, own-property symbol checks
// and per-alert delivery state
import { afterEach, describe, expect, it, vi } from "vitest";
import { yTicks } from "../src/chart";
import { mcp } from "../src/mcp";
import { evaluatePriceAlerts } from "../src/price-alerts";
import { isSupportedPair } from "../src/symbols";
import { handleUpdate } from "../src/telegram-bot";
import { sqliteDb } from "./sqlite";

const MIGRATIONS = ["0001_init.sql", "0002_alerts.sql", "0003_price_alerts.sql", "0004_usage.sql", "0005_rial_prices.sql", "0006_backfill_daily.sql"];
const NOW = new Date("2026-11-01T07:00:00Z");

afterEach(() => vi.unstubAllGlobals());

function alertsDb() {
  const db = sqliteDb(MIGRATIONS);
  db.sqlite
    .prepare("INSERT INTO latest (symbol, ts, price, high, low, raw, fetched_at) VALUES (?, ?, ?, ?, ?, '', ?)")
    .run("price_dollar_rl", "2026-11-01 10:00:00", 3000000, 3000000, 3000000, NOW.toISOString());
  return db;
}

const rows = (db) => db.sqlite.prepare("SELECT chat_id, triggered FROM price_alerts ORDER BY id").all();

describe("mcp batch limit", () => {
  const call = (id) => ({ jsonrpc: "2.0", id, method: "ping" });
  const post = (body) => mcp(new Request("https://x/mcp", { method: "POST", body: JSON.stringify(body) }), null);

  it("rejects a batch longer than 10 messages before running any of them", async () => {
    const response = await post(Array.from({ length: 11 }, (_, i) => call(i)));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32600);
  });

  it("still answers a batch of 10", async () => {
    const response = await post(Array.from({ length: 10 }, (_, i) => call(i)));
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(10);
  });
});

describe("symbol checks use own properties only", () => {
  it("rejects names inherited from Object.prototype", () => {
    for (const name of ["constructor", "__proto__", "tostring", "hasownproperty"]) {
      expect(isSupportedPair(name, "irr")).toBe(false);
      expect(isSupportedPair("usd", name)).toBe(false);
    }
    expect(isSupportedPair("usd", "irr")).toBe(true);
  });

  it("the bot refuses an alert on an inherited name", async () => {
    const db = alertsDb();
    await handleUpdate(db, { message: { chat: { id: 1 }, text: "/alert constructor > 5" } }, NOW);
    expect(rows(db)).toEqual([]);
  });
});

describe("price-alert delivery", () => {
  async function twoFiringAlerts() {
    const db = alertsDb();
    await handleUpdate(db, { message: { chat: { id: 1 }, text: "/alert usd > 1" } }, NOW);
    await handleUpdate(db, { message: { chat: { id: 2 }, text: "/alert usd > 1" } }, NOW);
    expect(rows(db)).toHaveLength(2);
    return db;
  }

  it("keeps a delivered alert marked sent when a later send throws", async () => {
    const db = await twoFiringAlerts();
    vi.stubGlobal("fetch", async (url, init) => {
      if (JSON.parse(init.body).chat_id === "2") {
        throw new Error("network down");
      }
      return new Response("{}");
    });
    await evaluatePriceAlerts(db, { TELEGRAM_BOT_TOKEN: "test" }).catch(() => {});
    expect(rows(db)).toEqual([
      { chat_id: "1", triggered: 1 },
      { chat_id: "2", triggered: 0 },
    ]);
  });

  it("does not mark an alert sent when Telegram refuses it", async () => {
    const db = await twoFiringAlerts();
    vi.stubGlobal("fetch", async (url, init) =>
      JSON.parse(init.body).chat_id === "2" ? new Response("Too Many Requests", { status: 429 }) : new Response("{}")
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await evaluatePriceAlerts(db, { TELEGRAM_BOT_TOKEN: "test" });
    expect(rows(db)).toEqual([
      { chat_id: "1", triggered: 1 },
      { chat_id: "2", triggered: 0 },
    ]);
  });
});

describe("chart ticks", () => {
  it("stays bounded when the range is below floating-point resolution", () => {
    const value = 2 ** 53;
    expect(yTicks(value, value + 2).length).toBeLessThanOrEqual(50);
  });
});
