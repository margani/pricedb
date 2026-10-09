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

  it("redirects www to the bare domain, keeping path and query", async () => {
    const response = await worker.fetch(new Request("https://www.priceto.day/api?x=1"), {}, { waitUntil() {} });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://priceto.day/api?x=1");
  });

  it("redirects www for static pages too, and serves other paths from the assets", async () => {
    const redirect = await worker.fetch(new Request("https://www.priceto.day/api"), {}, { waitUntil() {} });
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("Location")).toBe("https://priceto.day/api");

    const asked = [];
    const env = { ASSETS: { fetch: async (req) => (asked.push(new URL(req.url).pathname), new Response("page")) } };
    await worker.fetch(new Request("https://priceto.day/api"), env, { waitUntil() {} });
    const api = await worker.fetch(new Request("https://priceto.day/v1/nope"), env, { waitUntil() {} });
    expect(asked).toEqual(["/api"]);
    expect(api.status).toBe(404);
  });
});
