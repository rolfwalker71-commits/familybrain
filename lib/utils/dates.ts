export function nowIso(): string {
  return new Date().toISOString();
}

const EN_MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function swissParts(day: number, month: number, year: number): string | null {
  if (
    !Number.isFinite(day) ||
    !Number.isFinite(month) ||
    !Number.isFinite(year) ||
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    year < 1000
  ) {
    return null;
  }
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

/** Display dates as EU/Swiss `TT.MM.JJJJ` (ISO, US slash, or English month names). */
export function toSwissDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "–";
  const raw = isoDate.trim();
  if (!raw) return "–";

  const already = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (already) {
    return (
      swissParts(Number(already[1]), Number(already[2]), Number(already[3])) ||
      raw
    );
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) {
    return (
      swissParts(Number(iso[3]), Number(iso[2]), Number(iso[1])) || raw
    );
  }

  // US-style slash dates from cruise/airline docs (MM/DD/YYYY)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\b|$)/.exec(raw);
  if (us) {
    return swissParts(Number(us[2]), Number(us[1]), Number(us[3])) || raw;
  }

  // "July 21, 2026" / "Jul 21 2026"
  const en = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(raw);
  if (en) {
    const month = EN_MONTHS[en[1].toLowerCase()];
    if (month) {
      return swissParts(Number(en[2]), month, Number(en[3])) || raw;
    }
  }

  // "21 July 2026"
  const enDayFirst = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/.exec(raw);
  if (enDayFirst) {
    const month = EN_MONTHS[enDayFirst[2].toLowerCase()];
    if (month) {
      return (
        swissParts(Number(enDayFirst[1]), month, Number(enDayFirst[3])) || raw
      );
    }
  }

  return raw;
}

function hour12To24(hour: number, minute: number, ampm: string): string | null {
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 1 ||
    hour > 12 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  const suffix = ampm.replace(/\./g, "").toLowerCase();
  let h = hour;
  if (suffix.startsWith("a")) {
    if (h === 12) h = 0;
  } else if (suffix.startsWith("p")) {
    if (h !== 12) h += 12;
  } else {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Display a time as 24h `HH:mm` (also converts `3:45 PM` / `12am`). */
export function toSwissTime(raw: string | null | undefined): string {
  if (!raw) return "–";
  const trimmed = raw.trim();
  if (!trimmed) return "–";

  const twelve = trimmed.match(
    /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)$/i
  );
  if (twelve) {
    const converted = hour12To24(
      Number(twelve[1]),
      twelve[2] != null ? Number(twelve[2]) : 0,
      twelve[3]
    );
    if (converted) return converted;
  }

  const twentyFour = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFour) {
    const h = Number(twentyFour[1]);
    const m = Number(twentyFour[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  return trimmed;
}

/** Rewrite common date/time tokens in free text to EU date + 24h time. */
export function formatDatesInText(text: string): string {
  return text
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => `${d}.${m}.${y}`)
    .replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_, m, d, y) => {
      return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
    })
    .replace(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
      (full, monthName: string, day: string, year: string) => {
        const month = EN_MONTHS[monthName.toLowerCase()];
        return month ? swissParts(Number(day), month, Number(year)) || full : full;
      }
    )
    .replace(
      /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/gi,
      (full, h: string, m: string, ampm: string) =>
        hour12To24(Number(h), Number(m), ampm) || full
    )
    .replace(
      /\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/gi,
      (full, h: string, ampm: string) =>
        hour12To24(Number(h), 0, ampm) || full
    );
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
  const swiss = toSwissTime(raw.trim());
  if (swiss === "–") return "";
  const m = swiss.match(/^(\d{2}):(\d{2})$/);
  return m ? `${m[1]}:${m[2]}` : "";
}

/** ISO date (yyyy-mm-dd) for today in local timezone (`<input type="date">`). */
export function todayDateInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
