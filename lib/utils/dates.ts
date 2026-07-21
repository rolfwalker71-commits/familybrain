export function nowIso(): string {
  return new Date().toISOString();
}

export function toSwissDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "–";
  const date = isoDate.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return isoDate;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

/** Normalize stored dates/datetimes to `yyyy-mm-dd` for `<input type="date">`. */
export function toDateInputValue(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (iso) return iso[1];
  const swiss = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (swiss) {
    return `${swiss[3]}-${swiss[2].padStart(2, "0")}-${swiss[1].padStart(2, "0")}`;
  }
  return "";
}

/** Normalize stored times to `HH:mm` for `<input type="time">`. */
export function toTimeInputValue(raw: string | null | undefined): string {
  if (!raw) return "";
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO date (yyyy-mm-dd) N days before today. */
export function daysAgo(days: number): string {
  return daysFromNow(-Math.abs(days));
}

export function currentYear(): number {
  return new Date().getFullYear();
}
