// Renders the PWA icons in worker/public/icons from the same chart mark as the
// favicon. Run after changing the design: node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

await initWasm(readFileSync(new URL("../node_modules/@resvg/resvg-wasm/index_bg.wasm", import.meta.url)));

const LINE = "M7 22l6-7 5 4 7-9";
// "any": rounded tile like the favicon. "maskable": full-bleed background with
// the mark inside the central 80% safe zone, since launchers crop the corners.
const svg = (maskable) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${maskable ? 0 : 7}" fill="#36a2eb"/>
  <g transform="${maskable ? "translate(3.2 3.2) scale(0.8)" : ""}">
    <path d="${LINE}" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const icons = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
];
for (const [name, size, maskable] of icons) {
  const png = new Resvg(svg(maskable), { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(new URL(`../worker/public/icons/${name}`, import.meta.url), png);
  console.log(name, size, png.length, "bytes");
}
