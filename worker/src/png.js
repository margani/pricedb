import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import font from "./Vazirmatn-Regular.ttf";

let ready;

// Renders an SVG to PNG; Vazirmatn covers both Latin and Persian text
export async function svgToPng(svg) {
  ready ??= initWasm(resvgWasm);
  await ready;
  const resvg = new Resvg(svg, {
    font: { fontBuffers: [new Uint8Array(font)], defaultFontFamily: "Vazirmatn", loadSystemFonts: false },
  });
  return resvg.render().asPng();
}
