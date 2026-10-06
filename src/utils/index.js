import { CommodityMappings, DataSources } from "./constants";
import chartConfig from "./chart-config.json";

export function getDataSource(symbol, base) {
  const commodityMapping = CommodityMappings.filter(
    (_) => _.symbol === symbol && _.base === base
  )[0];

  if (!commodityMapping) {
    return null;
  }

  const dataSource = DataSources[commodityMapping.source];
  const nameInSource = dataSource[symbol];
  if (!nameInSource) {
    return null;
  }

  return dataSource;
}

export function parseDate(dateString, defaultValue) {
  try {
    if (!dateString) {
      return defaultValue;
    }

    return new Date(Date.parse(dateString));
  } catch {
    return defaultValue;
  }
}

// tgju timestamps ("2026-10-01 19:59:54") are Tehran local time without an
// offset. Iran has had no DST since 2022, so it's a fixed UTC+03:30.
export function parseTehranTimestamp(ts) {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(ts ?? "");
  return match ? new Date(`${match[1]}T${match[2]}+03:30`) : parseDate(ts);
}

const tehranDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" });

// The Tehran calendar day of an instant, as midnight UTC of that date, so daily
// records are bucketed the same way regardless of the server's time zone.
export function toTehranDay(date) {
  return new Date(`${tehranDateFormat.format(date)}T00:00:00.000Z`);
}

export function parseIntWithDefault(value, defaultValue) {
  try {
    if (!value) {
      return defaultValue;
    }

    return parseInt(value);
  } catch {
    return defaultValue;
  }
}

export function getLastXDays(days) {
  return new Date(new Date().setDate(new Date().getDate() - days));
}

export async function getHistory(dataSource, base, symbol, from, to) {
  let fromDate = parseDate(from, getLastXDays(30));
  let toDate = parseDate(to, new Date());

  const symbolDataUrl = dataSource.mapping(dataSource[symbol]);
  const SymbolDataResponse = await fetch(`${symbolDataUrl}/history.json`);
  const symbolData = (await SymbolDataResponse.json())
    .filter((_) => parseTehranTimestamp(_.ts) >= fromDate && parseTehranTimestamp(_.ts) <= toDate)
    .map(dataSource.transform)
    .map((_) => ({
      ..._,
      time: toTehranDay(new Date(_.time)),
    }));

  let data = [];
  if (base === "irr") {
    data = symbolData
  } else {
    const baseDataUrl = dataSource.mapping(dataSource[base]);
    const baseDataResponse = await fetch(`${baseDataUrl}/history.json`);
    const baseData = (await baseDataResponse.json())
      .filter((_) => parseTehranTimestamp(_.ts) >= fromDate && parseTehranTimestamp(_.ts) <= toDate)
      .map(dataSource.transform)
      .map((_) => ({
        ..._,
        time: toTehranDay(new Date(_.time)),
      }));

    baseData.forEach(baseItem => {
      const symbolItem = symbolData.filter(_ => _.time.toJSON() === baseItem.time.toJSON())[0]
      if (symbolItem) {
        // Only daily high/low of each leg are known, not when they happened, so
        // the cross rate's true high/low can't be derived. Return the widest
        // possible range instead of the meaningless high/high and low/low.
        data.push({
          price: symbolItem.price / baseItem.price,
          high: symbolItem.high / baseItem.low,
          low: symbolItem.low / baseItem.high,
          time: baseItem.time,
        })
      }
    });
  }

  return data
    .map((_) => ({
      ..._,
      time: _.time.toJSON()
    }))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

export function getChartImageUrl(history, title, rounding, precision) {
  const xAxis = history.map((_) => parseDate(_.time));
  const yAxis = history.map((_) => (_.price / Math.pow(10, rounding)).toFixed(precision));

  // Clone per request: the imported config is shared by concurrent invocations
  const config = structuredClone(chartConfig);
  config.options.title.text = title ?? "";
  config.data.labels = xAxis;
  config.data.datasets[0].data = yAxis;

  const json = JSON.stringify(config);
  const jsonEscaped = encodeURIComponent(json);
  return `https://quickchart.io/chart?width=600&height=400&backgroundcolor=g&bkg=white&c=${jsonEscaped}`;
}

// Data is refreshed at most every 30 minutes, so let the CDNs (Netlify and
// Cloudflare) serve cached responses instead of invoking the function each time.
// Only the listed query params are part of Netlify's cache key, so adding random
// params to a URL can't bypass the cache.
export function cacheHeaders(edgeMaxAge = 1800, queryParams = []) {
  const cdn = `public, max-age=${edgeMaxAge}, stale-while-revalidate=3600`;
  return {
    "Cache-Control": "public, max-age=300",
    "Netlify-CDN-Cache-Control": `${cdn}, durable`,
    "Netlify-Vary": `query=${queryParams.length ? queryParams.join("|") : "_"}`,
    "Cloudflare-CDN-Cache-Control": cdn,
  };
}

export function cachedJson(data, edgeMaxAge, queryParams) {
  return Response.json(data, { headers: cacheHeaders(edgeMaxAge, queryParams) });
}
