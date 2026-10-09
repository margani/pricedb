// A stateless MCP server (Streamable HTTP, JSON responses) exposing the API
// as tools, so LLM clients can query prices directly
import { change, convert, history, latest, symbols } from "./api";
import { API_SYMBOLS } from "./symbols";

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SERVER_INFO = { name: "pricedb", title: "Iran free-market prices (pricedb)", version: "1.0.0" };

const symbolSchema = (description) => ({ type: "string", enum: API_SYMBOLS, description });
const pair = {
  symbol: symbolSchema("What to price, e.g. usd, gold-miskal or coin-emami"),
  base: { ...symbolSchema("Unit of the price; irr (Iranian rial, 10 rial = 1 toman) unless asked otherwise"), default: "irr" },
};

const TOOLS = [
  {
    name: "list_symbols",
    description: "List the currencies, gold and coins that have prices.",
    inputSchema: { type: "object", properties: {} },
    run: () => symbols(),
  },
  {
    name: "get_latest_price",
    description: "Latest free-market price in Iran of a currency, gold or coin, with the day's high and low.",
    inputSchema: { type: "object", properties: pair, required: ["symbol"] },
    run: (db, a) => latest(db, { symbol: a.symbol, base: a.base ?? "irr" }),
  },
  {
    name: "get_price_history",
    description: "Daily prices between two dates (default: the last 30 days).",
    inputSchema: {
      type: "object",
      properties: {
        ...pair,
        from: { type: "string", format: "date", description: "Start date, YYYY-MM-DD" },
        to: { type: "string", format: "date", description: "End date, YYYY-MM-DD" },
      },
      required: ["symbol"],
    },
    run: (db, a) => history(db, { symbol: a.symbol, base: a.base ?? "irr" }, params({ from: a.from, to: a.to })),
  },
  {
    name: "get_price_change",
    description: "Change of the latest price over periods such as 1d, 7d, 30d, 1y, in absolute terms and percent.",
    inputSchema: {
      type: "object",
      properties: { ...pair, periods: { type: "string", description: "Comma-separated, e.g. 1d,7d,30d,1y", default: "1d,7d,30d,1y" } },
      required: ["symbol"],
    },
    run: (db, a) => change(db, { symbol: a.symbol, base: a.base ?? "irr" }, params({ period: a.periods })),
  },
  {
    name: "convert",
    description: "Convert an amount between two symbols using the latest prices, e.g. how many Emami coins 1000 USD buys.",
    inputSchema: {
      type: "object",
      properties: {
        from: symbolSchema("Symbol to convert from"),
        to: symbolSchema("Symbol to convert to"),
        amount: { type: "number", default: 1 },
      },
      required: ["from", "to"],
    },
    run: (db, a) => convert(db, params({ from: a.from, to: a.to, amount: a.amount })),
  },
];

function params(values) {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(name, String(value));
    }
  }
  return search;
}

const result = (id, value) => ({ jsonrpc: "2.0", id, result: value });
const error = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function callTool(db, { name, arguments: args = {} }) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return null;
  }

  try {
    const response = await tool.run(db, args);
    const text = await response.text();
    return { content: [{ type: "text", text }], isError: response.status !== 200 };
  } catch (err) {
    console.error(`MCP tool ${name} failed`, err);
    return { content: [{ type: "text", text: "Failed fetching data" }], isError: true };
  }
}

// Handles one JSON-RPC message; returns undefined for notifications
export async function handleMessage(db, message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return error(message?.id, -32600, "Invalid request");
  }

  const { id, method, params: p = {} } = message;
  if (id === undefined) {
    return undefined;
  }

  switch (method) {
    case "initialize":
      return result(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Free-market prices in Iran (from tgju.org), updated every 30 minutes during market hours. Prices are in rial unless another base is given; divide by 10 for toman.",
      });
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: TOOLS.map(({ run, ...tool }) => tool) });
    case "tools/call": {
      const output = await callTool(db, p);
      return output ? result(id, output) : error(id, -32602, `Unknown tool: ${p.name}`);
    }
    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
}

export async function mcp(request, db) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(error(null, -32700, "Parse error"), { status: 400 });
  }

  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handleMessage(db, m)))).filter(Boolean);
  if (!replies.length) {
    return new Response(null, { status: 202 });
  }

  return Response.json(Array.isArray(body) ? replies : replies[0]);
}
