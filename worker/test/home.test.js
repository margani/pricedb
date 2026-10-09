import { describe, expect, it } from "vitest";
import worker, { homePage } from "../src/index";

describe("home page", () => {
  it("shows the API page on the api subdomain and the prices page elsewhere", () => {
    expect(homePage(new URL("https://api.priceto.day/"))).toBe("/api");
    expect(homePage(new URL("https://priceto.day/"))).toBe("/");
    expect(homePage(new URL("https://www.priceto.day/"))).toBe("/");
    expect(homePage(new URL("https://pricedb-sandbox.whosane.workers.dev/"))).toBe("/");
  });

  it("serves that page from the static assets", async () => {
    const asked = [];
    const env = { ASSETS: { fetch: async (req) => (asked.push(new URL(req.url).pathname), new Response("page")) } };
    await worker.fetch(new Request("https://api.priceto.day/"), env, { waitUntil() {} });
    await worker.fetch(new Request("https://priceto.day/"), env, { waitUntil() {} });
    expect(asked).toEqual(["/api", "/"]);
  });
});
