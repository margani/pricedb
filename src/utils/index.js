import { CommodityMappings, DataSources } from "./constants";
const chartConfig = require("./chart-config.json");

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

export async function getHistory(dataSource, symbol, from, to) {
  let fromDate = parseDate(from, getLastXDays(30));
  let toDate = parseDate(to, new Date());

  const dataUrl = dataSource.mapping(dataSource[symbol]);
  const dataResponse = await fetch(`${dataUrl}/history.json`);
  const data = await dataResponse.json();

  return data
    .filter((_) => parseDate(_.ts) >= fromDate && parseDate(_.ts) <= toDate)
    .map(dataSource.transform)
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

export function getChartImageUrl(history, title, rounding, precision) {
  const xAxis = history.map((_) => parseDate(_.time));
  const yAxis = history.map((_) => (_.price / Math.pow(10, rounding)).toFixed(precision));

  chartConfig.options.title.text = title ?? "";
  chartConfig.data.labels = xAxis;
  chartConfig.data.datasets[0].data = yAxis;

  const json = JSON.stringify(chartConfig);
  const jsonEscaped = encodeURIComponent(json);
  return `https://quickchart.io/chart?width=600&height=400&backgroundcolor=g&bkg=white&c=${jsonEscaped}`;
}
