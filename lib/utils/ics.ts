export type CalendarEvent = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** ISO date yyyy-mm-dd */
  startDate: string;
  /** ISO date yyyy-mm-dd (inclusive). If omitted, single-day event. */
  endDate?: string;
  url?: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
  };
}

/** ICS all-day DATE value YYYYMMDD */
export function toIcsDateValue(isoDate: string): string | null {
  const p = parseIsoDate(isoDate);
  if (!p) return null;
  return `${p.y}${pad(p.m)}${pad(p.d)}`;
}

/** Exclusive end date for all-day ICS (day after inclusive end). */
export function toIcsExclusiveEnd(isoDate: string): string | null {
  const p = parseIsoDate(isoDate);
  if (!p) return null;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    chunks.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return chunks.join("\r\n");
}

function stampUtcNow(): string {
  const n = new Date();
  return (
    `${n.getUTCFullYear()}${pad(n.getUTCMonth() + 1)}${pad(n.getUTCDate())}` +
    `T${pad(n.getUTCHours())}${pad(n.getUTCMinutes())}${pad(n.getUTCSeconds())}Z`
  );
}

export function buildIcsCalendar(events: CalendarEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FamilyBrain//CH//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  const now = stampUtcNow();

  for (const event of events) {
    const start = toIcsDateValue(event.startDate);
    if (!start) continue;
    const inclusiveEnd = event.endDate || event.startDate;
    const end = toIcsExclusiveEnd(inclusiveEnd);
    if (!end) continue;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(event.uid)}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }
    if (event.url) {
      lines.push(`URL:${escapeIcsText(event.url)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function downloadIcs(filename: string, events: CalendarEvent[]) {
  if (typeof window === "undefined" || events.length === 0) return;
  const content = buildIcsCalendar(events);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
