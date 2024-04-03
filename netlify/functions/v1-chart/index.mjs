import {
  getDataSource,
  getHistory,
  getChartImageUrl,
  parseIntWithDefault,
} from "../../../src/utils";

export default async (request, context) => {
  try {
    const { symbol, base } = context.params;
    const requestUrl = new URL(request.url);
    const title = requestUrl.searchParams.get("title");
    const from = requestUrl.searchParams.get("from");
    const to = requestUrl.searchParams.get("to");
    let trimDigits = parseIntWithDefault(requestUrl.searchParams.get("trimDigits"), 0);
    if (trimDigits < 0) {
      trimDigits = 0;
    }

    const dataSource = getDataSource(symbol, base);
    if (!dataSource) {
      return Response.json(
        { error: `No exchange rate found for [${symbol}] and [${base}]` },
        { status: 404 }
      );
    }

    const history = await getHistory(dataSource, symbol, from, to);
    const imageUrl = getChartImageUrl(history, title, trimDigits);
    return await fetch(imageUrl);
  } catch (error) {
    return Response.json({ error: "Failed fetching data" }, { status: 500 });
  }
};

export const config = {
  path: "/v1/chart/:base/:symbol",
};
