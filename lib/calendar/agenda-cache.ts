import { getSetting, setSetting } from "@/lib/db/migrations";
import type { AgendaItem } from "@/lib/dashboard/overview";

type CachedAgendaRange = "today" | "week" | "14d";

export type CalendarAgendaCacheRecord = {
  fetchedAt: string;
  range: CachedAgendaRange;
  rangeStart: string;
  rangeEnd: string;
  items: AgendaItem[];
};

function cacheKey(
  userId: number | null,
  rangeStart: string,
  rangeEnd: string
): string {
  return `calendar_agenda_cache_v1_u${userId ?? 0}_${rangeStart}_${rangeEnd}`;
}

export function readCalendarAgendaCache(
  userId: number | null,
  rangeStart: string,
  rangeEnd: string
): CalendarAgendaCacheRecord | null {
  const raw = getSetting(cacheKey(userId, rangeStart, rangeEnd));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CalendarAgendaCacheRecord;
    if (!parsed?.fetchedAt || !Array.isArray(parsed.items)) return null;
    if (parsed.rangeStart !== rangeStart || parsed.rangeEnd !== rangeEnd) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCalendarAgendaCache(
  userId: number | null,
  record: CalendarAgendaCacheRecord
): void {
  setSetting(
    cacheKey(userId, record.rangeStart, record.rangeEnd),
    JSON.stringify(record)
  );
}

export function filterAgendaItemsBySources(
  items: AgendaItem[],
  selected: Set<string> | null
): AgendaItem[] {
  if (selected == null) return items;
  return items.filter(
    (item) => !item.calendarId || selected.has(item.calendarId)
  );
}
