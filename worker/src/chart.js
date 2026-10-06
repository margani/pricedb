// Renders price charts as SVG, replacing quickchart.io (600-point limit)
const WIDTH = 600;
const HEIGHT = 400;
const MARGIN = { top: 44, right: 24, bottom: 40, left: 72 };
const FONT = "Vazirmatn, Verdana, sans-serif";
const LINE = "#36a2eb";
const UP = "#16a34a";
const DOWN = "#dc2626";

const escapeXml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

const round = (n) => Math.round(n * 100) / 100;

// 1, 2, 2.5 or 5 times a power of ten, so axis labels are readable
function niceStep(range, count) {
  const raw = range / count;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

export function yTicks(min, max, count = 5) {
  if (min === max) {
    const pad = Math.abs(min) * 0.01 || 1;
    [min, max] = [min - pad, max + pad];
  }

  const step = niceStep(max - min, count);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(time, spanDays) {
  const date = new Date(time);
  const month = MONTHS[date.getUTCMonth()];
  return spanDays > 90 ? `${month} ${date.getUTCFullYear()}` : `${month} ${date.getUTCDate()}`;
}

function xTicks(minTime, maxTime, count = 6) {
  if (minTime === maxTime) {
    return [minTime];
  }

  return Array.from({ length: count }, (_, i) => minTime + ((maxTime - minTime) * i) / (count - 1));
}

const formatValue = (value, precision) =>
  value.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision });

function frame(title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="${FONT}">
<rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>
<text x="${WIDTH / 2}" y="26" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${escapeXml(title ?? "")}</text>
${body}
</svg>`;
}

// Shared axes for line and candlestick charts
function axes(points, low, high, precision) {
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const times = points.map((p) => new Date(p.time).getTime());
  const [minTime, maxTime] = [Math.min(...times), Math.max(...times)];
  const ticks = yTicks(Math.min(...low), Math.max(...high));
  const [minY, maxY] = [ticks[0], ticks[ticks.length - 1]];

  // A single point sits in the middle
  const x = (time) =>
    maxTime === minTime ? MARGIN.left + plotWidth / 2 : MARGIN.left + ((time - minTime) / (maxTime - minTime)) * plotWidth;
  const y = (value) => MARGIN.top + (1 - (value - minY) / (maxY - minY)) * plotHeight;

  const spanDays = (maxTime - minTime) / 86400000;
  const grid = ticks
    .map(
      (tick) =>
        `<line x1="${MARGIN.left}" x2="${WIDTH - MARGIN.right}" y1="${round(y(tick))}" y2="${round(y(tick))}" stroke="#e5e7eb"/>` +
        `<text x="${MARGIN.left - 8}" y="${round(y(tick) + 4)}" text-anchor="end" font-size="11" fill="#666">${formatValue(tick, precision)}</text>`
    )
    .join("\n");
  // Short ranges would repeat the same date; keep the first of each
  const seen = new Set();
  const xLabels = xTicks(minTime, maxTime)
    .filter((time) => {
      const label = formatDate(time, spanDays);
      return !seen.has(label) && seen.add(label);
    })
    .map(
      (time) =>
        `<text x="${round(x(time))}" y="${HEIGHT - MARGIN.bottom + 18}" text-anchor="middle" font-size="11" fill="#666">${formatDate(time, spanDays)}</text>`
    )
    .join("\n");
  const axisLine = `<line x1="${MARGIN.left}" x2="${WIDTH - MARGIN.right}" y1="${HEIGHT - MARGIN.bottom}" y2="${HEIGHT - MARGIN.bottom}" stroke="#999"/>`;

  return { x, y, times, plotWidth, chrome: `${grid}\n${axisLine}\n${xLabels}` };
}

const noData = (title) =>
  frame(title, `<text x="${WIDTH / 2}" y="${HEIGHT / 2}" text-anchor="middle" font-size="14" fill="#999">No data for this range</text>`);

// points: [{ time, value }]
export function renderLineChart(points, { title, precision = 0 } = {}) {
  if (!points.length) {
    return noData(title);
  }

  const values = points.map((p) => p.value);
  const { x, y, times, chrome } = axes(points, values, values, precision);
  const coords = points.map((p, i) => [round(x(times[i])), round(y(p.value))]);
  const line = coords.map(([cx, cy], i) => `${i ? "L" : "M"}${cx},${cy}`).join(" ");
  const baseline = HEIGHT - MARGIN.bottom;
  const area = `${line} L${coords[coords.length - 1][0]},${baseline} L${coords[0][0]},${baseline} Z`;

  // Few points: mark them; a single point also shows its value
  const markers =
    points.length <= 31
      ? coords.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="3" fill="${LINE}"/>`).join("")
      : "";
  const label =
    points.length === 1
      ? `<text x="${coords[0][0]}" y="${coords[0][1] - 10}" text-anchor="middle" font-size="12" fill="#333">${formatValue(values[0], precision)}</text>`
      : "";

  return frame(
    title,
    `${chrome}
<path d="${area}" fill="${LINE}" fill-opacity="0.12"/>
<path d="${line}" fill="none" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>
${markers}${label}`
  );
}

// points: [{ time, open, high, low, close }]
export function renderCandlestickChart(points, { title, precision = 0 } = {}) {
  if (!points.length) {
    return noData(title);
  }

  const { x, y, times, plotWidth, chrome } = axes(points, points.map((p) => p.low), points.map((p) => p.high), precision);
  const bodyWidth = Math.max(1, Math.min(12, (plotWidth / points.length) * 0.6));
  const candles = points
    .map((p, i) => {
      const cx = round(x(times[i]));
      const color = p.close >= p.open ? UP : DOWN;
      const top = round(y(Math.max(p.open, p.close)));
      const height = Math.max(1, round(y(Math.min(p.open, p.close)) - top));
      return (
        `<line x1="${cx}" x2="${cx}" y1="${round(y(p.high))}" y2="${round(y(p.low))}" stroke="${color}"/>` +
        `<rect x="${round(cx - bodyWidth / 2)}" y="${top}" width="${round(bodyWidth)}" height="${height}" fill="${color}"/>`
      );
    })
    .join("\n");

  return frame(title, `${chrome}\n${candles}`);
}
