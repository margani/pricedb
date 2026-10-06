import { telegramApi } from "./alerts";
import { getLatest } from "./db";
import { TGJU_KEYS } from "./symbols";

export const MAX_ALERTS_PER_CHAT = 10;

const fa = (n) => n.toLocaleString("fa-IR", { maximumFractionDigits: 0 });

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
  return `🔔 ${alert.symbol}: ${fa(Math.round(alert.price / 10))} تومان\n${verb} ${fa(Math.round(alert.threshold / 10))} تومان شد (هشدار #${fa(alert.id)})`;
}

export async function evaluatePriceAlerts(db, env) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return;
  }

  const { results: alerts } = await db.prepare("SELECT * FROM price_alerts").all();
  if (!alerts.length) {
    return;
  }

  const symbols = [...new Set(alerts.map((a) => a.symbol))].filter((s) => TGJU_KEYS[s]);
  const latest = await getLatest(db, symbols.map((s) => TGJU_KEYS[s]));
  const prices = Object.fromEntries(symbols.map((s) => [s, latest[TGJU_KEYS[s]]?.price]));
  const { fire, rearm } = evaluate(alerts, prices);

  for (const alert of fire) {
    await sendTo(env, alert.chat_id, alertMessage(alert));
  }

  const update = db.prepare("UPDATE price_alerts SET triggered = ?1 WHERE id = ?2");
  const statements = [...fire.map((a) => update.bind(1, a.id)), ...rearm.map((a) => update.bind(0, a.id))];
  if (statements.length) {
    await db.batch(statements);
  }
}
