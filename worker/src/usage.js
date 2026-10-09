// Counts API requests and distinct clients per UTC day for /v1/stats (#147).
// A client is its IP hashed with that day's random salt; rollUpUsage keeps only
// the counts of past days and deletes their salts and hashes.

// Monitoring and the stats endpoint itself would only count their own polling
const UNCOUNTED = new Set(["/v1/health", "/v1/stats"]);

export function isCountedRequest(request) {
  const { pathname } = new URL(request.url);
  if (request.method === "OPTIONS" || UNCOUNTED.has(pathname)) {
    return false;
  }
  // The landing page calls the API from the browser; count other sites and apps
  if (request.headers.get("Sec-Fetch-Site") === "same-origin") {
    return false;
  }
  return pathname.startsWith("/v1/") || pathname.startsWith("/tgju/") || pathname === "/mcp";
}

const utcDay = (date) => date.toISOString().slice(0, 10);

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashClient(salt, ip) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest, 0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// One salt read per isolate per day instead of one per request
let saltCache = { day: null, salt: null };

async function daySalt(db, day) {
  if (saltCache.day === day) {
    return saltCache.salt;
  }
  await db.prepare("INSERT OR IGNORE INTO usage_salts (day, salt) VALUES (?1, ?2)").bind(day, randomSalt()).run();
  const row = await db.prepare("SELECT salt FROM usage_salts WHERE day = ?1").bind(day).first();
  saltCache = { day, salt: row.salt };
  return row.salt;
}

export async function recordUsage(db, request, now = new Date()) {
  const day = utcDay(now);
  const statements = [
    db
      .prepare("INSERT INTO usage_daily (day, requests) VALUES (?1, 1) ON CONFLICT (day) DO UPDATE SET requests = requests + 1")
      .bind(day),
  ];
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) {
    const client = await hashClient(await daySalt(db, day), ip);
    statements.push(db.prepare("INSERT OR IGNORE INTO usage_clients (day, client) VALUES (?1, ?2)").bind(day, client));
  }
  await db.batch(statements);
}

// Stores the user count of every finished day and forgets its salt and hashes
export function rollUpUsage(db, now = new Date()) {
  const today = utcDay(now);
  return db.batch([
    db
      .prepare(
        `UPDATE usage_daily
         SET users = (SELECT COUNT(*) FROM usage_clients c WHERE c.day = usage_daily.day)
         WHERE day < ?1 AND day IN (SELECT DISTINCT day FROM usage_clients)`
      )
      .bind(today),
    db.prepare("DELETE FROM usage_clients WHERE day < ?1").bind(today),
    db.prepare("DELETE FROM usage_salts WHERE day < ?1").bind(today),
  ]);
}

export async function getUsage(db, now = new Date(), days = 30) {
  const today = utcDay(now);
  const from = utcDay(new Date(now.getTime() - (days - 1) * 86400000));
  const [{ results: rows }, todayUsers] = await db.batch([
    db.prepare("SELECT day, requests, users FROM usage_daily WHERE day >= ?1 ORDER BY day").bind(from),
    db.prepare("SELECT COUNT(*) AS users FROM usage_clients WHERE day = ?1").bind(today),
  ]);
  const usersToday = todayUsers.results[0]?.users ?? 0;
  const daily = rows.map((row) => ({
    date: row.day,
    requests: row.requests,
    users: row.day === today ? usersToday : row.users,
  }));
  const todayRow = daily.find((d) => d.date === today);
  return {
    today: { date: today, requests: todayRow?.requests ?? 0, users: usersToday },
    lastDays: {
      days,
      from,
      requests: daily.reduce((sum, d) => sum + d.requests, 0),
    },
    daily,
  };
}
