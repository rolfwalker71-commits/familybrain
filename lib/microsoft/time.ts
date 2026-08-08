/** Shared Zurich date helpers for Microsoft Graph windows. */

export function zurichYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function zurichHm(d = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Graph calendarView prefers local wall times with Prefer timezone header. */
export function dayWindowLocal(ymd: string): {
  start: string;
  end: string;
} {
  return {
    start: `${ymd}T00:00:00`,
    end: `${ymd}T23:59:59`,
  };
}

/**
 * UTC midnight for Graph **mail** `$filter` on receivedDateTime / sentDateTime.
 * Graph rejects bare local times without offset (DateTimeOffset).
 */
export function graphMailDateTimeUtc(ymd: string): string {
  const d = ymd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error(`Ungültiges Datum für Graph-Filter: ${ymd}`);
  }
  return `${d}T00:00:00.000Z`;
}

export function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToHm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
