// Daily Telegram report: closing prices, changes and a USD chart, sent after
// the evening update
import { telegramApi } from "./alerts";
import { renderLineChart } from "./chart";
import { getDailyPricesAt, getHistory, getLatest } from "./db";
import { TGJU_KEYS } from "./symbols";
import { daysAgo, toTehranDay } from "./time";

const REPORT_SYMBOLS = [
  ["usd", "دلار"],
  ["euro", "یورو"],
  ["gbp", "پوند"],
  ["gold-miskal", "مثقال طلا"],
  ["coin-emami", "سکه امامی"],
  ["coin-baharazadi", "سکه بهار آزادی"],
];

// [label, days back, oldest acceptable reference in days]; the history has
// gaps, so a reference much older than the period is skipped
const PERIODS = [
  ["روز", 1, 5],
  ["هفته", 7, 11],
];

const fa = (n, digits = 0) => n.toLocaleString("fa-IR", { maximumFractionDigits: digits });
const toman = (rial) => fa(Math.round(rial / 10));
const dateParts = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
// "یکشنبه ۱۲ مهر ۱۴۰۵"; the default fa-IR order puts the year first
const tehranDate = {
  format: (date) => {
    const part = Object.fromEntries(dateParts.formatToParts(date).map((p) => [p.type, p.value]));
    return `${part.weekday} ${part.day} ${part.month} ${part.year}`;
  },
};

function changeText(label, current, reference) {
  if (!reference) {
    return null;
  }

  const percent = ((current - reference) / reference) * 100;
  const arrow = percent > 0 ? "▲" : percent < 0 ? "▼" : "●";
  return `${label} ${arrow}${fa(Math.abs(percent), 1)}٪`;
}

// data: { now, prices: [{ name, price, refs: { [label]: price|null } }], yearAgo: price|null }
export function reportText({ now, prices, yearAgo }) {
  const lines = prices.map(({ name, price, refs }) => {
    const changes = PERIODS.map(([label]) => changeText(label, price, refs[label])).filter(Boolean);
    return `${name}: ${toman(price)} تومان${changes.length ? ` (${changes.join(" · ")})` : ""}`;
  });

  const usd = prices.find((p) => p.symbol === "usd");
  const yearLine = usd && yearAgo ? `\n\nدلار یک سال پیش: ${toman(yearAgo)} تومان` : "";
  return `📊 قیمت‌های بازار آزاد\n${tehranDate.format(now)}\n\n${lines.join("\n")}${yearLine}\n\npriceto.day`;
}

export async function buildReport(db, now = new Date()) {
  const keys = REPORT_SYMBOLS.map(([symbol]) => TGJU_KEYS[symbol]);
  const latest = await getLatest(db, keys);
  const prices = [];
  for (const [symbol, name] of REPORT_SYMBOLS) {
    const row = latest[TGJU_KEYS[symbol]];
    if (!row) {
      continue;
    }

    const instants = PERIODS.map(([, days]) => daysAgo(days, now).toISOString());
    const references = await getDailyPricesAt(db, TGJU_KEYS[symbol], instants);
    const refs = Object.fromEntries(
      PERIODS.map(([label, , maxDays], i) => {
        const ref = references[i];
        const fresh = ref && now - new Date(ref.ts) <= maxDays * 86400000;
        return [label, fresh ? ref.price : null];
      })
    );
    prices.push({ symbol, name, price: row.price, refs });
  }

  // Same Tehran day last year, allowing a few days for holidays
  const lastYear = toTehranDay(daysAgo(365, now));
  const [yearRow] = await getDailyPricesAt(db, TGJU_KEYS.usd, [new Date(lastYear.getTime() + 86400000).toISOString()]);
  const yearAgo = yearRow && lastYear - toTehranDay(new Date(yearRow.ts)) <= 4 * 86400000 ? yearRow.price : null;

  const history = await getHistory(db, TGJU_KEYS.usd, "daily", daysAgo(30, now).toISOString(), now.toISOString());
  const chart = renderLineChart(
    history.map((row) => ({ time: toTehranDay(new Date(row.ts)).toJSON(), value: row.price / 10000 })),
    { title: "دلار در ۳۰ روز گذشته (هزار تومان)", precision: 1 }
  );

  return { text: reportText({ now, prices, yearAgo }), chart };
}

export async function sendDailyReport(db, env, now = new Date()) {
  const chatId = env.TELEGRAM_REPORT_CHAT_ID || env.TELEGRAM_CHAT_ID;
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) {
    return false;
  }

  const { text, chart } = await buildReport(db, now);
  const { svgToPng } = await import("./png");
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", text);
  form.append("photo", new Blob([await svgToPng(chart)], { type: "image/png" }), "usd.png");

  const response = await fetch(`${telegramApi(env)}/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
  if (!response.ok) {
    console.error("Daily report failed", response.status, await response.text());
  }
  return response.ok;
}
