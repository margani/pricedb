import { CommodityMappings, DataSources } from "./constants";

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

export function getLastXDays(days) {
  return new Date(new Date().setDate(new Date().getDate() - days));
}
