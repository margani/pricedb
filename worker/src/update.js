import { updateAlert } from "./alerts";
import { getHealth, pruneRuns, recordRun, saveRows } from "./db";
import { TRACKED_SYMBOLS } from "./symbols";
import { fetchCurrentPrices, selectRows } from "./tgju";
import { daysAgo } from "./time";

// Keep in sync with wrangler.jsonc
export const DAILY_CRON = "30 17 * * *";

// Alert when two runs in a row fail, so a single network blip stays quiet
const FAILURES_BEFORE_ALERT = 2;
// The source stops publishing on holidays, so only alert after a full day
const STALE_DATA_MS = 24 * 60 * 60 * 1000;

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
export async function runUpdate(db, mode, { env = {}, fetchPrices = fetchCurrentPrices, now = () => new Date() } = {}) {
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
