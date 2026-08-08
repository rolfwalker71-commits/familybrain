import { getSetting, setSetting } from "@/lib/db/migrations";
import { findRolfAppUserId } from "@/lib/calendar/ics-calendars";
import { getCalendarAgenda } from "@/lib/calendar/agenda-feed";
import { hasOpenAIKey } from "@/lib/ai/client";
import {
  buildAgendaAiIconKey,
  ensureAgendaAiIcon,
  lookupAgendaAiIconUrl,
  shouldHaveAgendaAiIcon,
  type AgendaIconSubject,
} from "@/lib/dashboard/agenda-ai-icon";

export const AGENDA_AI_LAST_SYNC_KEY = "agenda_ai_icons_last_sync_at";
export const AGENDA_AI_TOMORROW_PREP_KEY = "agenda_ai_icons_tomorrow_prep_ymd";
/** Catch-up for today's new events — throttle between scheduler ticks. */
export const AGENDA_AI_SYNC_INTERVAL_MS = 20 * 60 * 1000;

function zurichYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function zurichHour(d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour")?.value || 0);
}

export type AgendaAiIconSyncSummary = {
  attempted: boolean;
  reason?: string;
  userId?: number;
  targetDates?: string[];
  examined?: number;
  generated?: number;
  cached?: number;
  errors?: number;
};

/**
 * Background: from ~18:00 Zurich prepare icons for tomorrow; always fill
 * missing icons for today (throttled). Recurring titles reuse the file cache.
 */
export async function syncAgendaAiIconsIfDue(options?: {
  force?: boolean;
  now?: Date;
  maxGenerate?: number;
}): Promise<AgendaAiIconSyncSummary> {
  const now = options?.now ?? new Date();
  if (!hasOpenAIKey()) {
    return { attempted: false, reason: "no-openai" };
  }

  const userId = findRolfAppUserId();
  if (userId == null) {
    return { attempted: false, reason: "no-user" };
  }

  const today = zurichYmd(now);
  const tomorrow = addDaysYmd(today, 1);
  const hour = zurichHour(now);
  const tomorrowPrepDone = getSetting(AGENDA_AI_TOMORROW_PREP_KEY) === tomorrow;
  const wantTomorrowPrep = hour >= 18 && !tomorrowPrepDone;

  if (!options?.force && !wantTomorrowPrep) {
    const lastRaw = getSetting(AGENDA_AI_LAST_SYNC_KEY);
    if (lastRaw) {
      const last = new Date(lastRaw).getTime();
      if (
        Number.isFinite(last) &&
        now.getTime() - last < AGENDA_AI_SYNC_INTERVAL_MS
      ) {
        return { attempted: false, reason: "throttled", userId };
      }
    }
  }

  setSetting(AGENDA_AI_LAST_SYNC_KEY, now.toISOString());

  const targetDates = new Set<string>([today]);
  if (wantTomorrowPrep || options?.force) targetDates.add(tomorrow);

  try {
    const feed = await getCalendarAgenda({
      userId,
      range: "week",
      includeWeather: true,
    });

    const subjects = new Map<string, AgendaIconSubject>();
    const tomorrowKeys = new Set<string>();

    for (const item of feed.items) {
      if (!targetDates.has(item.date)) continue;
      if (!shouldHaveAgendaAiIcon(item)) continue;
      const subject: AgendaIconSubject = {
        title: item.title,
        location: item.location,
        description: item.description,
        calendarType: item.calendarType,
        kind: item.kind,
        calendarName: item.calendarName,
        meetUrl: item.meetUrl,
        time: item.time,
        endTime: item.endTime,
        driveMinutes: item.driveMinutes ?? null,
        distanceKm: item.distanceKm ?? null,
        coords: item.coords
          ? { lat: item.coords.lat, lon: item.coords.lon }
          : null,
      };
      const key = buildAgendaAiIconKey(subject);
      if (!key) continue;
      if (!subjects.has(key)) subjects.set(key, subject);
      if (item.date === tomorrow) tomorrowKeys.add(key);
    }

    let generated = 0;
    let cached = 0;
    let errors = 0;
    const maxGenerate = Math.max(1, options?.maxGenerate ?? 8);

    for (const subject of subjects.values()) {
      const hit = lookupAgendaAiIconUrl(subject);
      if (hit) {
        cached += 1;
        continue;
      }
      if (generated >= maxGenerate) continue;
      try {
        const result = await ensureAgendaAiIcon(subject);
        if (result?.generated) generated += 1;
        else if (result) cached += 1;
      } catch (err) {
        errors += 1;
        console.warn(
          "[agenda-ai-icon] bg:",
          err instanceof Error ? err.message : err
        );
      }
    }

    if (wantTomorrowPrep || options?.force) {
      const tomorrowMissing = [...tomorrowKeys].some((key) => {
        const subject = subjects.get(key);
        return subject ? !lookupAgendaAiIconUrl(subject) : false;
      });
      if (!tomorrowMissing) {
        setSetting(AGENDA_AI_TOMORROW_PREP_KEY, tomorrow);
      }
    }

    return {
      attempted: true,
      userId,
      targetDates: [...targetDates],
      examined: subjects.size,
      generated,
      cached,
      errors,
    };
  } catch (error) {
    console.warn(
      "[agenda-ai-icon] sync failed:",
      error instanceof Error ? error.message : error
    );
    return {
      attempted: true,
      userId,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
