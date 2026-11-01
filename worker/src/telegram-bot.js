// Telegram bot commands for price alerts, received through a webhook
import { getLatest } from "./db";
import { movingAverage, parseIndicator } from "./indicators";
import { MAX_ALERTS_PER_CHAT, formatValue, isMet, sendTo, toStored } from "./price-alerts";
import { BOT_KEYS, isBotSymbol } from "./symbols";

const SYMBOLS = Object.keys(BOT_KEYS);
const fa = (n) => n.toLocaleString("fa-IR", { maximumFractionDigits: 0 });

const HELP = `دستورها:
/price usd — قیمت فعلی
/alert usd > 280000 — وقتی دلار از ۲۸۰٬۰۰۰ تومان بالاتر رفت خبرم کن
/alert coin-emami < 250000000 — وقتی پایین‌تر آمد
/alert usd > ma50 — وقتی قیمت پایانی روز از میانگین متحرک ۵۰ روزه بالاتر رفت (ma200 هم هست)
/alert tedpix < ma200 — شاخص کل بورس تهران زیر میانگین ۲۰۰ روزه
/alerts — فهرست هشدارها
/unalert 3 — حذف هشدار شماره ۳

نمادها: ${SYMBOLS.join(", ")}
قیمت‌ها به تومان است؛ tedpix (شاخص کل بورس) به واحد شاخص.`;

// Accepts Persian/Arabic digits and thousands separators
export function parseNumber(text) {
  const ascii = String(text)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[,٬،]/g, "");
  return /^\d+(\.\d+)?$/.test(ascii) ? Number(ascii) : NaN;
}

export function parseCommand(text) {
  const [head, ...args] = String(text ?? "").trim().split(/\s+/);
  if (!head?.startsWith("/")) {
    return null;
  }
  // "/alert@pricedb_bot" in groups
  return { command: head.slice(1).split("@")[0].toLowerCase(), args };
}

async function alertCommand(db, chatId, args, now) {
  const [symbolArg, operator, amount] = args;
  const symbol = symbolArg?.toLowerCase();
  const direction = operator === ">" ? "above" : operator === "<" ? "below" : null;
  const period = parseIndicator(amount);
  const value = parseNumber(amount);
  if (!isBotSymbol(symbol) || !direction || !(period || value > 0)) {
    return `فرمت درست: /alert usd > 280000 یا /alert usd > ma50\n\n${HELP}`;
  }

  const { count } = await db.prepare("SELECT COUNT(*) AS count FROM price_alerts WHERE chat_id = ?1").bind(chatId).first();
  if (count >= MAX_ALERTS_PER_CHAT) {
    return `حداکثر ${fa(MAX_ALERTS_PER_CHAT)} هشدار. با /unalert یکی را حذف کنید.`;
  }

  const sign = direction === "above" ? ">" : "<";
  if (period) {
    return indicatorAlert(db, chatId, symbol, direction, period, now);
  }

  const { id } = await db
    .prepare(
      `INSERT INTO price_alerts (chat_id, symbol, direction, threshold, created_at) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id`
    )
    .bind(chatId, symbol, direction, toStored(symbol, value), now.toISOString())
    .first();
  return `✅ هشدار #${fa(id)}: ${symbol} ${sign} ${formatValue(symbol, toStored(symbol, value))}`;
}

// Fires on a crossing only: an alert whose condition already holds starts as
// triggered, so it waits for the price to cross back and then over again
async function indicatorAlert(db, chatId, symbol, direction, period, now) {
  const key = BOT_KEYS[symbol];
  const [average, latest] = await Promise.all([movingAverage(db, key, period), getLatest(db, [key])]);
  const price = latest[key]?.price;
  if (average == null || price == null) {
    return `هنوز داده‌ی روزانه‌ی کافی برای میانگین ${fa(period)} روزه‌ی ${symbol} نیست.`;
  }

  const indicator = `ma${period}`;
  const triggered = isMet({ direction, threshold: average }, price) ? 1 : 0;
  const { id } = await db
    .prepare(
      `INSERT INTO price_alerts (chat_id, symbol, direction, threshold, indicator, triggered, created_at)
       VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6) RETURNING id`
    )
    .bind(chatId, symbol, direction, indicator, triggered, now.toISOString())
    .first();
  const side = direction === "above" ? "بالای" : "زیر";
  return `✅ هشدار #${fa(id)}: ${symbol} ${direction === "above" ? ">" : "<"} ${indicator}
وقتی قیمت پایانی روز به ${side} میانگین ${fa(period)} روزه رفت خبر می‌دهم (بعد از بسته شدن بازار).
اکنون: ${formatValue(symbol, price)}، میانگین: ${formatValue(symbol, average)}`;
}

async function listCommand(db, chatId) {
  const { results } = await db.prepare("SELECT * FROM price_alerts WHERE chat_id = ?1 ORDER BY id").bind(chatId).all();
  if (!results.length) {
    return "هشداری ندارید. مثال: /alert usd > 280000";
  }

  return results
    .map((a) => `#${fa(a.id)}: ${a.symbol} ${a.direction === "above" ? ">" : "<"} ${a.indicator ?? formatValue(a.symbol, a.threshold)}`)
    .join("\n");
}

async function unalertCommand(db, chatId, args) {
  const id = parseNumber(args[0]);
  const { meta } = await db.prepare("DELETE FROM price_alerts WHERE id = ?1 AND chat_id = ?2").bind(id, chatId).run();
  return meta.changes ? `🗑 هشدار #${fa(id)} حذف شد.` : "این هشدار پیدا نشد. فهرست: /alerts";
}

async function priceCommand(db, args) {
  const symbol = (args[0] ?? "usd").toLowerCase();
  if (!isBotSymbol(symbol)) {
    return `نماد ناشناخته. نمادها: ${SYMBOLS.join(", ")}`;
  }

  const row = (await getLatest(db, [BOT_KEYS[symbol]]))[BOT_KEYS[symbol]];
  return row ? `${symbol}: ${formatValue(symbol, row.price)}` : "قیمت در دسترس نیست.";
}

// Returns the reply text for a Telegram update, or null to ignore it
export async function handleUpdate(db, update, now = new Date()) {
  const message = update?.message;
  const parsed = parseCommand(message?.text);
  if (!message?.chat?.id || !parsed) {
    return null;
  }

  const chatId = String(message.chat.id);
  switch (parsed.command) {
    case "alert":
      return alertCommand(db, chatId, parsed.args, now);
    case "alerts":
      return listCommand(db, chatId);
    case "unalert":
      return unalertCommand(db, chatId, parsed.args);
    case "price":
      return priceCommand(db, parsed.args);
    case "start":
    case "help":
      return `سلام! قیمت‌های بازار آزاد از priceto.day\n\n${HELP}`;
    default:
      return HELP;
  }
}

// Compares fixed-length digests byte by byte, so the time taken does not
// depend on how much of the secret a caller guessed right (#226)
export async function sameSecret(given, expected) {
  const digest = async (text) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  const [a, b] = await Promise.all([digest(given ?? ""), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function telegramWebhook(request, env) {
  // Telegram echoes the secret given to setWebhook; reject anything else
  if (
    request.method !== "POST" ||
    !env.TELEGRAM_BOT_TOKEN ||
    !env.TELEGRAM_WEBHOOK_SECRET ||
    !(await sameSecret(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.TELEGRAM_WEBHOOK_SECRET))
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const update = await request.json().catch(() => null);
  try {
    const reply = await handleUpdate(env.DB, update);
    if (reply) {
      await sendTo(env, update.message.chat.id, reply);
    }
  } catch (error) {
    console.error("Telegram update failed", error);
  }

  // Always 200, so Telegram doesn't retry a message we can't handle
  return new Response("ok");
}
