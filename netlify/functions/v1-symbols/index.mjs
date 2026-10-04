import { API_ENDPOINT, CommodityMappings } from "../../../src/utils/constants";
import { cachedJson } from "../../../src/utils";

export default async (request, context) => {
  try {
    const symbols = CommodityMappings.map((mapping) => mapping.symbol).filter(
      (value, index, array) => array.indexOf(value) === index
    );

    return cachedJson(
      {
        success: true,
        symbols,
      },
      86400
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed fetching data" }, { status: 500 });
  }
};

export const config = {
  path: "/v1/symbols",
};
