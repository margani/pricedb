import { readFileSync } from "node:fs";
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

describe("service worker", () => {
  const assets = { fetch: async () => new Response('const VERSION = "__DEPLOY__";') };

  it("stamps the deployed commit so every deploy is a new version", async () => {
    const response = await worker.fetch(new Request("https://priceto.day/sw.js"), { ASSETS: assets, GIT_COMMIT: "abc123" }, { waitUntil() {} });
    expect(await response.text()).toBe('const VERSION = "abc123";');
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("Content-Type")).toContain("javascript");
  });

  it("stamps VERSION in the real sw.js", async () => {
    const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    const real = { fetch: async () => new Response(source.replace("const VERSION", "// __DEPLOY__ in a comment\nconst VERSION")) };
    const response = await worker.fetch(new Request("https://priceto.day/sw.js"), { ASSETS: real, GIT_COMMIT: "abc123" }, { waitUntil() {} });
    const text = await response.text();
    expect(text).toContain('const VERSION = "abc123";');
    expect(text).not.toContain("__DEPLOY__");
  });

  it("falls back to dev when deployed without a commit", async () => {
    const response = await worker.fetch(new Request("https://priceto.day/sw.js"), { ASSETS: assets }, { waitUntil() {} });
    expect(await response.text()).toBe('const VERSION = "dev";');
  });
});
