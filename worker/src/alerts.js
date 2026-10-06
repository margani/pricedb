// While an alert stays active, remind at most this often
const REMIND_AFTER_MS = 6 * 60 * 60 * 1000;

// Overridable for local testing against a fake Telegram server
export const telegramApi = (env) => env.TELEGRAM_API_URL || "https://api.telegram.org";

// Sends a Telegram message; does nothing until the bot secrets are configured
export async function sendTelegram(env, text, fetchImpl = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return false;
  }

  const response = await fetchImpl(`${telegramApi(env)}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  if (!response.ok) {
    console.error("Telegram sendMessage failed", response.status, await response.text());
  }
  return response.ok;
}

const formatDuration = (ms) => {
  const minutes = Math.round(ms / 60000);
  return minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
};

// Decides what to send for an alert given its stored state. Returns the
// message (or null) and the state to store.
export function nextAlertState(state, failing, message, now) {
  const nowIso = now.toISOString();
  if (failing) {
    if (!state?.active) {
      return {
        notify: `🔴 pricedb: ${message}`,
        state: { active: 1, since: nowIso, last_notified_at: nowIso, message },
      };
    }

    if (now - new Date(state.last_notified_at) >= REMIND_AFTER_MS) {
      const duration = formatDuration(now - new Date(state.since));
      return {
        notify: `🔴 pricedb: still failing for ${duration}: ${message}`,
        state: { ...state, last_notified_at: nowIso, message },
      };
    }

    return { notify: null, state: { ...state, message } };
  }

  if (state?.active) {
    const duration = formatDuration(now - new Date(state.since));
    return {
      notify: `✅ pricedb: recovered after ${duration} (${state.message})`,
      state: { active: 0, since: null, last_notified_at: nowIso, message: null },
    };
  }

  return { notify: null, state: null };
}

export async function updateAlert(db, env, name, failing, message, now = new Date()) {
  const state = await db.prepare("SELECT * FROM alerts WHERE name = ?1").bind(name).first();
  const next = nextAlertState(state, failing, message, now);
  if (next.state) {
    await db
      .prepare(
        `INSERT INTO alerts (name, active, since, last_notified_at, message) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (name) DO UPDATE SET active = excluded.active, since = excluded.since,
           last_notified_at = excluded.last_notified_at, message = excluded.message`
      )
      .bind(name, next.state.active, next.state.since, next.state.last_notified_at, next.state.message)
      .run();
  }

  if (next.notify) {
    await sendTelegram(env, next.notify);
  }
}
