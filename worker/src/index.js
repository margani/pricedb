import { badge, change, chart, convert, dataset, feed, health, history, latest, legacyFile, ohlc, onThisDay, stats, symbols, version } from "./api";
import { mcp } from "./mcp";
import { evaluatePriceAlerts } from "./price-alerts";
import { sendDailyReport } from "./report";
import { telegramWebhook } from "./telegram-bot";
import { DAILY_CRON, runUpdate } from "./update";
import { isCountedRequest, recordUsage, rollUpUsage } from "./usage";

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
  { pattern: new URLPattern({ pathname: "/v1/stats" }), handle: (env) => stats(env.DB), ttl: 300, params: [] },
  { pattern: new URLPattern({ pathname: "/v1/version" }), handle: (env) => version(env), ttl: 0, params: [] },
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

// The deployed commit is part of the key: the Cache API outlives deploys, so
// /v1/symbols kept listing 10 symbols for hours after 18 were added (#171)
export function cacheKey(url, params, deploy = "") {
  const key = new URL(url.origin + url.pathname);
  for (const name of [...params].sort()) {
    if (url.searchParams.has(name)) {
      key.searchParams.set(name, url.searchParams.get(name));
    }
  }
  if (deploy) {
    key.searchParams.set("deploy", deploy);
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

  const key = cacheKey(url, route.params, env.GIT_COMMIT);
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

const API_PREFIXES = ["/v1/", "/tgju/", "/telegram/"];

// Everything else is a static file from worker/public
export function isApiPath(pathname) {
  return pathname === "/mcp" || API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// api.priceto.day/ introduces the API (#152); every other host, priceto.day
// included, shows the prices page at "/"
export function homePage(url) {
  return url.hostname.startsWith("api.") ? "/api" : "/";
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // One address for the site: www.priceto.day/... → priceto.day/...
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/" && env.ASSETS) {
      return env.ASSETS.fetch(new Request(new URL(homePage(url), url), request));
    }
    if (env.ASSETS && !isApiPath(url.pathname)) {
      return env.ASSETS.fetch(request);
    }
    // Counted before the cache lookup, so cached answers are counted too
    if (isCountedRequest(request)) {
      ctx.waitUntil(recordUsage(env.DB, request).catch((error) => console.error("Usage count failed", error)));
    }
    const response = await handleRequest(request, env, ctx);
    // The edge cache keeps responses for the route's TTL; browsers for 5 minutes
    const cacheControl = response.status === 200 && response.headers.has("Cache-Control") ? "public, max-age=300" : "no-store";
    return withHeaders(response, { ...CORS_HEADERS, "Cache-Control": cacheControl });
  },

  async scheduled(event, env, ctx) {
    const mode = event.cron === DAILY_CRON ? "daily" : "hourly";
    ctx.waitUntil(
      (async () => {
        // First, so a failed price update doesn't also skip it
        await rollUpUsage(env.DB).catch((error) => console.error("Usage roll-up failed", error));
        await runUpdate(env.DB, mode, { env });
        await evaluatePriceAlerts(env.DB, env).catch((error) => console.error("Price alerts failed", error));
        if (mode === "daily") {
          await sendDailyReport(env.DB, env).catch((error) => console.error("Daily report failed", error));
        }
      })()
    );
  },
};
