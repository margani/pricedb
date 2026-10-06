// Approximate text width for 11px Verdana, the font shields.io badges use
const CHAR_WIDTH = 7;
const PADDING = 10;

const COLORS = {
  blue: "#007ec6",
  green: "#4c1",
  red: "#e05d44",
  orange: "#fe7d37",
  grey: "#555",
};

const escapeXml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

const textWidth = (text) => [...text].length * CHAR_WIDTH + PADDING * 2;

export function badgeColor(value) {
  if (!value) {
    return COLORS.blue;
  }

  if (COLORS[value]) {
    return COLORS[value];
  }

  return /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) ? `#${value}` : COLORS.blue;
}

export function formatValue(price, rounding, precision, unit) {
  const value = (price / Math.pow(10, rounding)).toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  return unit ? `${value} ${unit}` : value;
}

export function renderBadge(label, value, color) {
  const labelWidth = textWidth(label);
  const valueWidth = textWidth(value);
  const width = labelWidth + valueWidth;
  const [l, v] = [escapeXml(label), escapeXml(value)];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${l}: ${v}">
<title>${l}: ${v}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${labelWidth}" height="20" fill="#555"/><rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/><rect width="${width}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${l}</text><text x="${labelWidth / 2}" y="14">${l}</text>
<text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${v}</text><text x="${labelWidth + valueWidth / 2}" y="14">${v}</text>
</g>
</svg>`;
}
