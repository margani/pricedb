import { API_ENDPOINT, CommodityMappings } from "../../constants";

export default async (request, context) => {
  try {
    const symbols = CommodityMappings.map((mapping) => mapping.symbol).filter(
      (value, index, array) => array.indexOf(value) === index
    );

    return Response.json({
      success: true,
      symbols,
    });
  } catch (error) {
    return Response.json({ error: "Failed fetching data" }, { status: 500 });
  }
};

export const config = {
  path: "/v1/symbols",
};
