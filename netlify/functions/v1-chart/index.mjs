import {
  getDataSource,
  getHistory,
  getChartImageUrl,
  parseIntWithDefault,
} from "../../../src/utils";

export default async (request, context) => {
  try {
    const requestUrl = new URL(request.url);
    const title = requestUrl.searchParams.get("title");
    const from = requestUrl.searchParams.get("from");
    const to = requestUrl.searchParams.get("to");
    let rounding = parseIntWithDefault(requestUrl.searchParams.get("rounding"), 0);
    if (rounding < 0) {
      rounding = 0;
    }

    let precision = parseIntWithDefault(requestUrl.searchParams.get("precision"), 0);
    if (precision < 0) {
      precision = 0;
    }

    const { base: baseParam, symbol: symbolParam } = context.params;
    const symbol = symbolParam.toLowerCase();
    const base = baseParam.toLowerCase();

    const dataSource = getDataSource(symbol, base);
    if (!dataSource) {
      return Response.json(
        { error: `No exchange rate found for [${symbol}] and [${base}]` },
        { status: 404 }
      );
    }

    const history = await getHistory(dataSource, symbol, from, to);
    const imageUrl = getChartImageUrl(history, title, rounding, precision);
    return await fetch(imageUrl);
  } catch (error) {
    return Response.json({ error: "Failed fetching data" }, { status: 500 });
  }
};

export const config = {
  path: "/v1/chart/:base/:symbol",
};
