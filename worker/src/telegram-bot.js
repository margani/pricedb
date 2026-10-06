// Telegram bot commands for price alerts, received through a webhook
import { getLatest } from "./db";
import { MAX_ALERTS_PER_CHAT, sendTo } from "./price-alerts";
import { TGJU_KEYS } from "./symbols";

const SYMBOLS = Object.keys(TGJU_KEYS);
const fa = (n) => n.toLocaleString("fa-IR", { maximumFractionDigits: 0 });

const HELP = `دستورها:
/price usd — قیمت فعلی
/alert usd > 280000 — وقتی دلار از ۲۸۰٬۰۰۰ تومان بالاتر رفت خبرم کن
/alert coin-emami < 250000000 — وقتی پایین‌تر آمد
/alerts — فهرست هشدارها
/unalert 3 — حذف هشدار شماره ۳

نمادها: ${SYMBOLS.join(", ")}
قیمت‌ها به تومان است.`;

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
  const toman = parseNumber(amount);
  if (!TGJU_KEYS[symbol] || !direction || !(toman > 0)) {
    return `فرمت درست: /alert usd > 280000\n\n${HELP}`;
  }

  const { count } = await db.prepare("SELECT COUNT(*) AS count FROM price_alerts WHERE chat_id = ?1").bind(chatId).first();
  if (count >= MAX_ALERTS_PER_CHAT) {
    return `حداکثر ${fa(MAX_ALERTS_PER_CHAT)} هشدار. با /unalert یکی را حذف کنید.`;
  }

  const { id } = await db
    .prepare(
      `INSERT INTO price_alerts (chat_id, symbol, direction, threshold, created_at) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id`
    )
    .bind(chatId, symbol, direction, toman * 10, now.toISOString())
    .first();
  return `✅ هشدار #${fa(id)}: ${symbol} ${direction === "above" ? ">" : "<"} ${fa(toman)} تومان`;
}

async function listCommand(db, chatId) {
  const { results } = await db.prepare("SELECT * FROM price_alerts WHERE chat_id = ?1 ORDER BY id").bind(chatId).all();
  if (!results.length) {
    return "هشداری ندارید. مثال: /alert usd > 280000";
  }

  return results
    .map((a) => `#${fa(a.id)}: ${a.symbol} ${a.direction === "above" ? ">" : "<"} ${fa(Math.round(a.threshold / 10))} تومان`)
    .join("\n");
}

async function unalertCommand(db, chatId, args) {
  const id = parseNumber(args[0]);
  const { meta } = await db.prepare("DELETE FROM price_alerts WHERE id = ?1 AND chat_id = ?2").bind(id, chatId).run();
  return meta.changes ? `🗑 هشدار #${fa(id)} حذف شد.` : "این هشدار پیدا نشد. فهرست: /alerts";
}

async function priceCommand(db, args) {
  const symbol = (args[0] ?? "usd").toLowerCase();
  if (!TGJU_KEYS[symbol]) {
    return `نماد ناشناخته. نمادها: ${SYMBOLS.join(", ")}`;
  }

  const row = (await getLatest(db, [TGJU_KEYS[symbol]]))[TGJU_KEYS[symbol]];
  return row ? `${symbol}: ${fa(Math.round(row.price / 10))} تومان` : "قیمت در دسترس نیست.";
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

export async function telegramWebhook(request, env) {
  // Telegram echoes the secret given to setWebhook; reject anything else
  if (
    request.method !== "POST" ||
    !env.TELEGRAM_BOT_TOKEN ||
    !env.TELEGRAM_WEBHOOK_SECRET ||
    request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET
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
