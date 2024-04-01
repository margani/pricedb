import { getDataSource, getHistory } from "../../../src/utils";

export default async (request, context) => {
  try {
    const { symbol, base } = context.params;
    const requestUrl = new URL(request.url);
    const from = requestUrl.searchParams.get("from");
    const to = requestUrl.searchParams.get("to");

    const dataSource = getDataSource(symbol, base);
    if (!dataSource) {
      return Response.json(
        { error: `No exchange rate found for [${symbol}] and [${base}]` },
        { status: 404 }
      );
    }

    let fromDate = parseDate(from, getLastXDays(30));
    let toDate = parseDate(to, new Date());

    const dataUrl = dataSource.mapping(dataSource[symbol]);
    const dataResponse = await fetch(`${dataUrl}/history.json`);
    const data = await dataResponse.json();

    const result = data
      .filter((_) => parseDate(_.ts) >= fromDate && parseDate(_.ts) <= toDate)
      .map(dataSource.transform);

    return Response.json({
      success: true,
      result,
    });
  } catch (error) {
    return Response.json({ error: "Failed fetching data" }, { status: 500 });
  }
};

export const config = {
  path: "/v1/history/:base/:symbol",
};
