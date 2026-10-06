export function saveRows(db, rows, granularity, fetchedAt) {
  const upsertLatest = db.prepare(
    `INSERT INTO latest (symbol, ts, price, high, low, raw, fetched_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT (symbol) DO UPDATE SET
       ts = excluded.ts, price = excluded.price, high = excluded.high,
       low = excluded.low, raw = excluded.raw, fetched_at = excluded.fetched_at
     WHERE excluded.ts >= latest.ts`
  );
  const insertHistory = db.prepare(
    `INSERT OR IGNORE INTO prices (symbol, granularity, ts, price, high, low, raw)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  );

  return db.batch(
    rows.flatMap((row) => [
      upsertLatest.bind(row.symbol, row.ts, row.price, row.high, row.low, row.raw, fetchedAt),
      insertHistory.bind(row.symbol, granularity, row.ts, row.price, row.high, row.low, row.raw),
    ])
  );
}

export function recordRun(db, run) {
  return db
    .prepare(
      `INSERT INTO runs (mode, started_at, finished_at, ok, saved, invalid, error)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(
      run.mode,
      run.startedAt,
      run.finishedAt,
      run.ok ? 1 : 0,
      run.saved ?? 0,
      run.invalid?.length ? JSON.stringify(run.invalid) : null,
      run.error ?? null
    )
    .run();
}

export function pruneRuns(db, before) {
  return db.prepare("DELETE FROM runs WHERE started_at < ?1").bind(before).run();
}

export async function getLatest(db, symbols) {
  const placeholders = symbols.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(`SELECT symbol, ts, price, high, low, raw FROM latest WHERE symbol IN (${placeholders})`)
    .bind(...symbols)
    .all();
  return Object.fromEntries(results.map((row) => [row.symbol, row]));
}

export async function getHistory(db, symbol, granularity, from, to) {
  const { results } = await db
    .prepare(
      `SELECT ts, price, high, low, raw FROM prices
       WHERE symbol = ?1 AND granularity = ?2 AND ts >= ?3 AND ts <= ?4
       ORDER BY ts`
    )
    .bind(symbol, granularity, from, to)
    .all();
  return results;
}

export async function getHealth(db) {
  return db
    .prepare(
      `SELECT
         (SELECT MAX(started_at) FROM runs) AS last_run_at,
         (SELECT ok FROM runs ORDER BY started_at DESC LIMIT 1) AS last_run_ok,
         (SELECT MAX(finished_at) FROM runs WHERE ok = 1) AS last_success_at,
         (SELECT MAX(ts) FROM latest WHERE symbol NOT LIKE '%:%') AS latest_data_at`
    )
    .first();
}

// The last daily price at or before each of the given instants
export async function getDailyPricesAt(db, symbol, instants) {
  const statement = db.prepare(
    `SELECT ts, price FROM prices
     WHERE symbol = ?1 AND granularity = 'daily' AND ts <= ?2
     ORDER BY ts DESC LIMIT 1`
  );
  const results = await db.batch(instants.map((instant) => statement.bind(symbol, instant)));
  return results.map(({ results: rows }) => rows[0] ?? null);
}

export async function getDailyRows(db, symbols, from, to) {
  const placeholders = symbols.map((_, i) => `?${i + 3}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT symbol, ts, price FROM prices
       WHERE granularity = 'daily' AND ts >= ?1 AND ts <= ?2 AND symbol IN (${placeholders})
       ORDER BY ts`
    )
    .bind(from, to, ...symbols)
    .all();
  return results;
}
