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
