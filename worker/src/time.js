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

const persianYearFormat = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { timeZone: "Asia/Tehran", year: "numeric" });

// The Persian (Jalali) year of an instant, in Tehran
export function persianYear(date) {
  return Number(persianYearFormat.format(date).replace(/\D/g, ""));
}

// Tehran midnight of Nowruz (1 Farvardin) of a Persian year, as a UTC instant.
// Nowruz falls on 20 or 21 March, so check the days around it.
function nowruz(year) {
  const gregorian = year + 621;
  for (let day = 18; day <= 23; day++) {
    if (persianYear(new Date(Date.UTC(gregorian, 2, day, 8, 30))) === year) {
      return new Date(Date.UTC(gregorian, 2, day) - 3.5 * 60 * 60 * 1000);
    }
  }
  throw new Error(`No Nowruz found for ${year}`);
}

// The UTC range [from, to) of a Persian year, or null for a year out of range
export function persianYearRange(year) {
  if (!Number.isInteger(year) || year < 1300 || year > 1500) {
    return null;
  }
  return { from: nowruz(year).toISOString(), to: nowruz(year + 1).toISOString() };
}
