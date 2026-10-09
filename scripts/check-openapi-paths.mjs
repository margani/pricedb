// Fails if openapi.yaml documents a path the Worker doesn't serve, or the other way round.
import { readFileSync } from "node:fs";

const spec = readFileSync("openapi.yaml", "utf8");
const serverPrefix = new URL(spec.match(/^servers:\n(?:.*\n)*?\s+url: (\S+)/m)[1]).pathname;
const documented = [...spec.matchAll(/^  (\/\S*):$/gm)].map(
  ([, path]) => serverPrefix + path.replace(/\{(\w+)\}/g, ":$1")
);

// API routes the Worker serves (the legacy /tgju file paths aren't documented)
const served = [...readFileSync("worker/src/index.js", "utf8").matchAll(/pathname: "(\/v1\/[^"]+)"/g)].map(
  // Drop regex constraints such as :file(daily\\.csv|hourly\\.csv)
  ([, path]) => path.replace(/(:\w+)\([^/]*\)/g, "$1")
);

const missing = documented.filter((path) => !served.includes(path));
const undocumented = served.filter((path) => !documented.includes(path));
for (const path of missing) console.error(`Documented but not served: ${path}`);
for (const path of undocumented) console.error(`Served but not documented: ${path}`);

if (missing.length || undocumented.length) process.exit(1);
console.log(`openapi.yaml matches ${served.length} endpoints`);
