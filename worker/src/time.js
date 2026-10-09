// tgju timestamps ("2026-10-01 19:59:54") are Tehran local time without an
// offset. Iran has had no DST since 2022, so it's a fixed UTC+03:30.
const TEHRAN_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

export function parseTehranTimestamp(ts) {
  const match = TEHRAN_TIMESTAMP.exec(ts ?? "");
  return match ? new Date(`${match[1]}T${match[2]}+03:30`) : null;
}

const tehranDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" });

// The Tehran calendar day of an instant, as midnight UTC of that date
export function toTehranDay(date) {
  return new Date(`${tehranDateFormat.format(date)}T00:00:00.000Z`);
}

// Parses a from/to query param, falling back when it's missing or invalid
export function parseDateParam(value, fallback) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function daysAgo(days, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
