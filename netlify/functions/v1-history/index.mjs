import { cachedJson, getDataSource, getHistory } from "../../../src/utils";

export default async (request, context) => {
  try {
    const requestUrl = new URL(request.url);
    const from = requestUrl.searchParams.get("from");
    const to = requestUrl.searchParams.get("to");

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

    const history = await getHistory(dataSource, base, symbol, from, to);
    return cachedJson({
      success: true,
      result: history,
    }, undefined, ["from", "to"]);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed fetching data" }, { status: 500 });
  }
};

export const config = {
  path: "/v1/history/:base/:symbol",
};
