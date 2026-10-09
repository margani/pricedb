import { updateAlert } from "./alerts";
import { getHealth, getLatest, pruneRuns, recordRun, saveRows } from "./db";
import { TRACKED_SYMBOLS, USD_KEY, USD_PRICED, rialKey } from "./symbols";
import { fetchCurrentPrices, selectRows } from "./tgju";
import { daysAgo } from "./time";
import { divergence, fetchSecondSourceUsd, secondSourceRow } from "./second-source";

// Keep in sync with wrangler.jsonc
export const DAILY_CRON = "30 17 * * *";

// Alert when two runs in a row fail, so a single network blip stays quiet
const FAILURES_BEFORE_ALERT = 2;
// The source stops publishing on holidays, so only alert after a full day
const STALE_DATA_MS = 24 * 60 * 60 * 1000;
// tgju's dollar and Bitpin's tether normally differ by about 1%
const MAX_SOURCE_DIVERGENCE = 0.05;

// Stores the second source and alerts when it disagrees with tgju. Never
// fails the run: tgju stays the primary source.
async function updateSecondSource(db, env, mode, rows, now, fetchSecond) {
  try {
    const second = secondSourceRow(await fetchSecond(), now);
    if (!second) {
      throw new Error("bitpin returned no valid USDT price");
    }

    await saveRows(db, [second], mode, now.toISOString());
    const tgju = rows.find((row) => row.symbol === "price_dollar_rl");
    if (tgju) {
      const gap = divergence(tgju.price, second.price);
      await updateAlert(
        db,
        env,
        "source-divergence",
        gap > MAX_SOURCE_DIVERGENCE,
        `tgju USD ${tgju.price} and Bitpin USDT ${second.price} differ by ${(gap * 100).toFixed(1)}%`,
        now
      );
    }
  } catch (error) {
    console.error("Second source failed", error);
  }
}

// Rial copies of the USD-priced symbols, with the dollar of this update or,
// when tgju left it out (it doesn't change on Fridays), the last stored one
export async function rialRows(db, rows) {
  const usdPriced = rows.filter((row) => USD_PRICED.includes(row.symbol));
  if (!usdPriced.length) {
    return [];
  }

  const usd = rows.find((row) => row.symbol === USD_KEY) ?? (await getLatest(db, [USD_KEY]))[USD_KEY];
  if (!usd) {
    return [];
  }

  // Whole rials: 4140.19 * 2700000 would otherwise read 11178512999.999998
  const rial = (usdValue) => Math.round(usdValue * usd.price);
  return usdPriced.map((row) => ({
    symbol: rialKey(row.symbol),
    ts: row.ts,
    price: rial(row.price),
    high: rial(row.high),
    low: rial(row.low),
    raw: "",
  }));
}

async function consecutiveFailures(db) {
  const { results } = await db
    .prepare("SELECT ok FROM runs ORDER BY id DESC LIMIT ?1")
    .bind(FAILURES_BEFORE_ALERT)
    .all();
  return results.filter((run) => run.ok === 0).length;
}

async function checkAlerts(db, env, now, error) {
  try {
    const failing = error && (await consecutiveFailures(db)) >= FAILURES_BEFORE_ALERT;
    await updateAlert(db, env, "update", failing, `price update failed: ${error?.message ?? error}`, now);

    const { latest_data_at: latestDataAt } = (await getHealth(db)) ?? {};
    const stale = !latestDataAt || now - new Date(latestDataAt) > STALE_DATA_MS;
    await updateAlert(db, env, "stale-data", stale, `no new prices from tgju since ${latestDataAt ?? "ever"}`, now);
  } catch (alertError) {
    console.error("Checking alerts failed", alertError);
  }
}

// Fetches tgju and stores the tracked symbols. Daily runs add to the daily
// history, all others to the hourly history; both refresh the latest prices.
export async function runUpdate(
  db,
  mode,
  { env = {}, fetchPrices = fetchCurrentPrices, fetchSecond = fetchSecondSourceUsd, now = () => new Date() } = {}
) {
  const startedAt = now().toISOString();
  let rows = [];
  let invalid = [];
  try {
    const current = await fetchPrices();
    ({ rows, invalid } = selectRows(current, TRACKED_SYMBOLS, now()));

    if (invalid.length > TRACKED_SYMBOLS.length / 2) {
      throw new Error(`${invalid.length} of ${TRACKED_SYMBOLS.length} symbols are invalid`);
    }

    await saveRows(db, rows, mode, startedAt);
    const derived = await rialRows(db, rows);
    if (derived.length) {
      await saveRows(db, derived, mode, startedAt);
    }
    await updateSecondSource(db, env, mode, rows, now(), fetchSecond);
    if (mode === "daily") {
      await pruneRuns(db, daysAgo(30, now()).toISOString());
    }

    if (invalid.length) {
      console.warn("Skipped invalid symbols", invalid);
    }

    await recordRun(db, { mode, startedAt, finishedAt: now().toISOString(), ok: true, saved: rows.length, invalid });
    await checkAlerts(db, env, now());
  } catch (error) {
    console.error(`${mode} update failed`, error);
    await recordRun(db, {
      mode,
      startedAt,
      finishedAt: now().toISOString(),
      ok: false,
      invalid,
      error: String(error?.message ?? error),
    });
    await checkAlerts(db, env, now(), error);
    throw error;
  }
}
