import { badge, change, chart, convert, dataset, feed, health, history, latest, legacyFile, ohlc, onThisDay, symbols } from "./api";
import { mcp } from "./mcp";
import { evaluatePriceAlerts } from "./price-alerts";
import { sendDailyReport } from "./report";
import { telegramWebhook } from "./telegram-bot";
import { DAILY_CRON, runUpdate } from "./update";

const DAY = 24 * 60 * 60;

// Each route lists the query params that affect its response; only those are
// part of the cache key, so random params can't bypass the cache.
const ROUTES = [
  { pattern: new URLPattern({ pathname: "/v1/symbols" }), handle: () => symbols(), ttl: DAY, params: [] },
  {
    pattern: new URLPattern({ pathname: "/v1/latest/:base/:symbol" }),
    handle: (env, p, q) => latest(env.DB, p, q),
    ttl: 1800,
    params: ["source"],
  },
  {
    pattern: new URLPattern({ pathname: "/v1/history/:base/:symbol" }),
    handle: (env, p, q) => history(env.DB, p, q),
    ttl: 1800,
    params: ["from", "to", "format"],
  },
  {
    pattern: new URLPattern({ pathname: "/v1/chart/:base/:symbol" }),
    handle: (env, p, q) => chart(env.DB, p, q),
    ttl: 1800,
    params: ["title", "from", "to", "rounding", "precision", "format", "type"],
  },
  {
    pattern: new URLPattern({ pathname: "/v1/change/:base/:symbol" }),
    handle: (env, p, q) => change(env.DB, p, q),
    ttl: 1800,
    params: ["period"],
  },
  {
    pattern: new URLPattern({ pathname: "/v1/badge/:base/:symbol" }),
    handle: (env, p, q) => badge(env.DB, p, q),
    ttl: 1800,
    params: ["label", "rounding", "precision", "unit", "color"],
  },
  {
    pattern: new URLPattern({ pathname: "/v1/convert" }),
    handle: (env, p, q) => convert(env.DB, q),
    ttl: 1800,
    params: ["from", "to", "amount"],
  },
  {
    pattern: new URLPattern({ pathname: "/v1/on-this-day/:base/:symbol" }),
    handle: (env, p) => onThisDay(env.DB, p),
    ttl: 1800,
    params: [],
  },
  {
    pattern: new URLPattern({ pathname: "/v1/ohlc/:base/:symbol" }),
    handle: (env, p, q) => ohlc(env.DB, p, q),
    ttl: 1800,
    params: ["from", "to"],
  },
  {
    pattern: new URLPattern({ pathname: "/v1/dataset/:file(daily\\.csv|hourly\\.csv)" }),
    handle: (env, p) => dataset(env.DB, p.file),
    ttl: 86400,
    params: [],
  },
  { pattern: new URLPattern({ pathname: "/v1/feed.xml" }), handle: (env) => feed(env.DB), ttl: 1800, params: [] },
  { pattern: new URLPattern({ pathname: "/v1/health" }), handle: (env) => health(env.DB), ttl: 0, params: [] },
  {
    pattern: new URLPattern({ pathname: "/tgju/current/:key/:file(latest\\.json|history\\.json|hourly-history\\.json)" }),
    handle: (env, p) => legacyFile(env.DB, p.key, p.file),
    ttl: 1800,
    params: [],
  },
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function withHeaders(response, headers) {
  const result = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) {
    result.headers.set(name, value);
  }
  return result;
}

export function cacheKey(url, params) {
  const key = new URL(url.origin + url.pathname);
  for (const name of [...params].sort()) {
    if (url.searchParams.has(name)) {
      key.searchParams.set(name, url.searchParams.get(name));
    }
  }
  return new Request(key);
}

function lowercaseParams(groups) {
  return Object.fromEntries(Object.entries(groups).map(([name, value]) => [name, value?.toLowerCase()]));
}

async function handleRequest(request, env, ctx) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { pathname } = new URL(request.url);
  if (pathname === "/mcp") {
    return mcp(request, env.DB);
  }

  if (pathname === "/telegram/webhook") {
    return telegramWebhook(request, env);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const route = ROUTES.find((r) => r.pattern.test(url));
  if (!route) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const key = cacheKey(url, route.params);
  const cache = caches.default;
  if (route.ttl) {
    const cached = await cache.match(key);
    if (cached) {
      return cached;
    }
  }

  const groups = route.pattern.exec(url).pathname.groups;
  const params = route.pattern.pathname.includes(":key") ? groups : lowercaseParams(groups);

  let response;
  try {
    response = await route.handle(env, params, url.searchParams);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed fetching data" }, { status: 500 });
  }

  if (route.ttl && response.status === 200) {
    response = withHeaders(response, { "Cache-Control": `public, max-age=${route.ttl}` });
    ctx.waitUntil(cache.put(key, response.clone()));
  }

  return response;
}

export default {
  async fetch(request, env, ctx) {
    const response = await handleRequest(request, env, ctx);
    // The edge cache keeps responses for the route's TTL; browsers for 5 minutes
    const cacheControl = response.status === 200 && response.headers.has("Cache-Control") ? "public, max-age=300" : "no-store";
    return withHeaders(response, { ...CORS_HEADERS, "Cache-Control": cacheControl });
  },

  async scheduled(event, env, ctx) {
    const mode = event.cron === DAILY_CRON ? "daily" : "hourly";
    ctx.waitUntil(
      (async () => {
        await runUpdate(env.DB, mode, { env });
        await evaluatePriceAlerts(env.DB, env).catch((error) => console.error("Price alerts failed", error));
        if (mode === "daily") {
          await sendDailyReport(env.DB, env).catch((error) => console.error("Daily report failed", error));
        }
      })()
    );
  },
};
