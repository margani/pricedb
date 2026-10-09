import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { version } from "../src/api";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

describe("version", () => {
  it("reports package.json's version and the deployed commit", async () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    const body = await version({ GIT_COMMIT: "0fe2810abc" }).json();
    expect(body).toEqual({ success: true, version: pkg.version, commit: "0fe2810abc" });
  });

  it("reports a null commit when deployed without one", async () => {
    expect((await version({}).json()).commit).toBeNull();
  });
});
