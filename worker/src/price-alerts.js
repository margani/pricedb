import { telegramApi } from "./alerts";
import { getLatest } from "./db";
import { movingAverage, parseIndicator } from "./indicators";
import { BOT_KEYS, isBotSymbol, isIndex } from "./symbols";

export const MAX_ALERTS_PER_CHAT = 10;

const fa = (n) => n.toLocaleString("fa-IR", { maximumFractionDigits: 0 });

// Stored values are rial for prices and points for indices; users read and
// type toman for prices
export const toStored = (symbol, value) => (isIndex(symbol) ? value : value * 10);
export const formatValue = (symbol, stored) =>
  isIndex(symbol) ? `${fa(Math.round(stored))} واحد` : `${fa(Math.round(stored / 10))} تومان`;

export async function sendTo(env, chatId, text) {
  const response = await fetch(`${telegramApi(env)}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!response.ok) {
    console.error("Telegram sendMessage failed", response.status, await response.text());
  }
  return response.ok;
}

export const isMet = (alert, price) => (alert.direction === "above" ? price >= alert.threshold : price <= alert.threshold);

// Which alerts to fire and which to re-arm, given the latest prices (rial)
export function evaluate(alerts, prices) {
  const fire = [];
  const rearm = [];
  for (const alert of alerts) {
    const price = prices[alert.symbol];
    if (price == null) {
      continue;
    }

    const met = isMet(alert, price);
    if (met && !alert.triggered) {
      fire.push({ ...alert, price });
    } else if (!met && alert.triggered) {
      rearm.push(alert);
    }
  }
  return { fire, rearm };
}

export function alertMessage(alert) {
  const verb = alert.direction === "above" ? "بالاتر از" : "پایین‌تر از";
  const level = alert.indicator
    ? `میانگین ${fa(parseIndicator(alert.indicator))} روزه (${formatValue(alert.symbol, alert.threshold)})`
    : formatValue(alert.symbol, alert.threshold);
  return `🔔 ${alert.symbol}: ${formatValue(alert.symbol, alert.price)}\n${verb} ${level} شد (هشدار #${fa(alert.id)})`;
}

// Indicator alerts compare the day's close with its moving average, so they
// are checked only on the daily run after the market closes; their threshold
// becomes the current average
async function withIndicatorLevels(db, alerts, daily) {
  const indicatorAlerts = daily ? alerts.filter((a) => a.indicator && isBotSymbol(a.symbol)) : [];
  const pairs = [...new Set(indicatorAlerts.map((a) => `${a.symbol} ${a.indicator}`))];
  const averages = Object.fromEntries(
    await Promise.all(
      pairs.map(async (pair) => {
        const [symbol, indicator] = pair.split(" ");
        const period = parseIndicator(indicator);
        return [pair, period ? await movingAverage(db, BOT_KEYS[symbol], period) : null];
      })
    )
  );
  return [
    ...alerts.filter((a) => !a.indicator),
    ...indicatorAlerts
      .map((a) => ({ ...a, threshold: averages[`${a.symbol} ${a.indicator}`] }))
      .filter((a) => a.threshold != null),
  ];
}

export async function evaluatePriceAlerts(db, env, { daily = false } = {}) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return;
  }

  const { results: stored } = await db.prepare("SELECT * FROM price_alerts").all();
  const alerts = await withIndicatorLevels(db, stored, daily);
  if (!alerts.length) {
    return;
  }

  const symbols = [...new Set(alerts.map((a) => a.symbol))].filter(isBotSymbol);
  const latest = await getLatest(db, symbols.map((s) => BOT_KEYS[s]));
  const prices = Object.fromEntries(symbols.map((s) => [s, latest[BOT_KEYS[s]]?.price]));
  const { fire, rearm } = evaluate(alerts, prices);

  // Each alert on its own: one failed send used to skip saving the state of
  // every alert, so the ones already delivered were sent again each run, and a
  // refused send (e.g. 429) was still marked as sent (#226)
  const delivered = [];
  for (const alert of fire) {
    try {
      if (await sendTo(env, alert.chat_id, alertMessage(alert))) {
        delivered.push(alert);
      }
    } catch (error) {
      console.error("Price alert send failed", alert.id, error);
    }
  }

  const update = db.prepare("UPDATE price_alerts SET triggered = ?1 WHERE id = ?2");
  const statements = [...delivered.map((a) => update.bind(1, a.id)), ...rearm.map((a) => update.bind(0, a.id))];
  if (statements.length) {
    await db.batch(statements);
  }
}
