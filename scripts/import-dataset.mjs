// Loads the latest public dataset release into a D1 database, e.g. for a
// self-hosted instance:
//   node scripts/import-dataset.mjs            # your instance (remote)
//   node scripts/import-dataset.mjs --local    # local `wrangler dev` database
// Extra arguments (e.g. --env production) are passed on to wrangler.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const REPO = "margani/pricedb";
const BATCH = 200;
const args = process.argv.slice(2);
const target = args.includes("--local") ? ["--local"] : ["--remote"];
const passThrough = args.filter((a) => a !== "--local" && a !== "--remote");

const quote = (text) => `'${String(text).replace(/'/g, "''")}'`;

// The original tgju record is kept as `raw` for the legacy JSON endpoints;
// rebuild it in tgju's format from the CSV values
const formatNumber = (value) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 8 });
const tehranTimestamp = (iso) =>
  new Date(new Date(iso).getTime() + 3.5 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

function toRaw({ time, price, high, low }) {
  return JSON.stringify({ p: formatNumber(price), h: formatNumber(high), l: formatNumber(low), ts: tehranTimestamp(time) });
}

async function download(url) {
  const response = await fetch(url, { headers: { "user-agent": "pricedb-import" } });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function parseCsv(text) {
  const [header, ...lines] = text.trim().split("\n");
  const columns = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, i) => [columns[i], value])));
}

const releases = JSON.parse((await download(`https://api.github.com/repos/${REPO}/releases?per_page=30`)).toString());
const release = releases.find((r) => r.tag_name.startsWith("dataset-"));
if (!release) {
  throw new Error("No dataset release found");
}
console.log(`Importing ${release.tag_name}`);

const statements = [];
const latest = new Map();
for (const granularity of ["daily", "hourly"]) {
  const asset = release.assets.find((a) => a.name === `prices-${granularity}.csv.gz`);
  const rows = parseCsv(gunzipSync(await download(asset.browser_download_url)).toString());
  console.log(`${granularity}: ${rows.length} rows`);

  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows
      .slice(i, i + BATCH)
      .map((r) => `(${quote(r.symbol)},'${granularity}',${quote(r.time)},${r.price},${r.high},${r.low},${quote(toRaw(r))})`);
    statements.push(`INSERT OR IGNORE INTO prices (symbol,granularity,ts,price,high,low,raw) VALUES ${values.join(",")};`);
  }

  for (const row of rows) {
    if (!latest.has(row.symbol) || latest.get(row.symbol).time < row.time) {
      latest.set(row.symbol, row);
    }
  }
}

for (const r of latest.values()) {
  statements.push(
    `INSERT INTO latest (symbol,ts,price,high,low,raw,fetched_at) VALUES (${quote(r.symbol)},${quote(r.time)},${r.price},${r.high},${r.low},${quote(toRaw(r))},${quote(r.time)}) ` +
      "ON CONFLICT (symbol) DO UPDATE SET ts = excluded.ts, price = excluded.price, high = excluded.high, low = excluded.low, raw = excluded.raw, fetched_at = excluded.fetched_at WHERE excluded.ts > latest.ts;"
  );
}

const file = join(mkdtempSync(join(tmpdir(), "pricedb-")), "import.sql");
writeFileSync(file, statements.join("\n"));
execFileSync("npx", ["wrangler", "d1", "execute", "DB", ...target, "--yes", "--file", file, ...passThrough], {
  cwd: new URL("../worker/", import.meta.url),
  stdio: "inherit",
});
