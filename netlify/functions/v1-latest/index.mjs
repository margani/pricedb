import { getDataSource } from "../../../src/utils";

export default async (request, context) => {
  try {
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

    const dataUrl = dataSource.mapping(dataSource[symbol]);
    const dataResponse = await fetch(`${dataUrl}/latest.json`);
    const data = await dataResponse.json();
    const transformedData = dataSource.transform(data);
    return Response.json({
      success: true,
      ...transformedData,
    });
  } catch (error) {
    return Response.json({ error: "Failed fetching data" }, { status: 500 });
  }
};

export const config = {
  path: "/v1/latest/:base/:symbol",
};
