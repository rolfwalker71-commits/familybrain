import type { AgendaItem } from "@/lib/dashboard/overview";

function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function eventWindowMinutes(item: AgendaItem): { start: number; end: number } | null {
  if (!item.time) return null;
  const start = hmToMinutes(item.time);
  if (start == null) return null;
  const end = item.endTime ? hmToMinutes(item.endTime) : null;
  return { start, end: end != null && end > start ? end : start + 60 };
}

/** Past after end + grace. All-day (no time) stay until end of day. */
export function isAgendaItemPastGrace(
  item: AgendaItem,
  today: string,
  nowHm: string,
  graceMinutes = 30
): boolean {
  if (item.date > today) return false;
  if (item.date < today) return true;
  const w = eventWindowMinutes(item);
  if (!w) {
    const now = hmToMinutes(nowHm) ?? 0;
    return now >= 24 * 60 - 1;
  }
  const now = hmToMinutes(nowHm) ?? 0;
  return now >= w.end + graceMinutes;
}

/**
 * Ablauf: heutige Termine nach Ende+grace weg; Folgetag nur erster Termin.
 */
export function filterAblaufTimelineItems(
  items: AgendaItem[],
  today: string,
  nowHm: string,
  graceMinutes = 30
): AgendaItem[] {
  const kept = items.filter(
    (item) => !isAgendaItemPastGrace(item, today, nowHm, graceMinutes)
  );
  const todayItems = kept.filter((i) => i.date === today);
  const later = kept
    .filter((i) => i.date > today)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.time || "99:99").localeCompare(b.time || "99:99")
    );
  const firstTomorrow = later[0] ? [later[0]] : [];
  return [...todayItems, ...firstTomorrow].sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return dc;
    return (a.time || "99:99").localeCompare(b.time || "99:99");
  });
}
