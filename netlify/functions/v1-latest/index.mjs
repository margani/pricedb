import { CommodityMappings, DataSources } from "../../constants";

export default async (request, context) => {
  try {
    const { symbol, base } = context.params;

    const commodityMapping = CommodityMappings.filter(
      (_) => _.symbol === symbol && _.base === base
    )[0];

    if (!commodityMapping) {
      return Response.json(
        { error: `No exchange rate found for [${symbol}] and [${base}]` },
        { status: 400 }
      );
    }

    const dataSource = DataSources[commodityMapping.source];

    const nameInSource = dataSource[symbol];
    if (!nameInSource) {
      return Response.json(
        {
          error: `Mappings for source [${commodityMapping.source}] and currency [${symbol}] is not found`,
        },
        { status: 400 }
      );
    }

    const dataUrl = dataSource.mapping(nameInSource);
    const response = await fetch(dataUrl);
    const data = await response.json();
    const transformed = dataSource.transform(data);
    return Response.json({
      success: true,
      ...transformed
    });
  } catch (error) {
    console.log(error);
    return Response.json({ error: "Failed fetching data" }, { status: 500 });
  }
};

export const config = {
  path: "/v1/latest/:base/:symbol",
};
