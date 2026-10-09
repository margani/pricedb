const PAGE_SIZE = 5000;
const HEADER = "symbol,time,price,high,low\n";

// Streams every record of a granularity as CSV, paging through D1 by key so
// the whole table never has to fit in memory
export function datasetCsv(db, granularity) {
  const encoder = new TextEncoder();
  let cursor = ["", ""];
  let started = false;
  return new ReadableStream({
    async pull(controller) {
      if (!started) {
        started = true;
        controller.enqueue(encoder.encode(HEADER));
        return;
      }

      const { results } = await db
        .prepare(
          `SELECT symbol, ts, price, high, low FROM prices
           WHERE granularity = ?1 AND (symbol, ts) > (?2, ?3)
             -- rial copies of USD prices (#129) can be rebuilt from the data itself
             AND symbol NOT LIKE 'irr:%'
           ORDER BY symbol, ts LIMIT ${PAGE_SIZE}`
        )
        .bind(granularity, ...cursor)
        .all();
      if (!results.length) {
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(results.map((r) => `${r.symbol},${r.ts},${r.price},${r.high},${r.low}\n`).join("")));
      const last = results[results.length - 1];
      cursor = [last.symbol, last.ts];
    },
  });
}
