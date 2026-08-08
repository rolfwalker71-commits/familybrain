import { getSetting, setSetting } from "@/lib/db/migrations";
import { findRolfAppUserId } from "@/lib/calendar/ics-calendars";
import { getCalendarAgenda } from "@/lib/calendar/agenda-feed";
import {
  agendaNotesAlreadyWritten,
  formatAgendaWeatherLabel,
  mergeAgendaNotesBlock,
  type AgendaNotesEnrichment,
} from "@/lib/dashboard/agenda-notes-block";
import {
  lookupAgendaAiIconUrl,
  shouldHaveAgendaAiIcon,
} from "@/lib/dashboard/agenda-ai-icon";
import { parseGoogleCalendarSourceId } from "@/lib/google/calendars";
import { patchGoogleEventDescription } from "@/lib/google/patch-event-description";
import {
  hasGoogleCalendarEventsWriteScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import { parseMicrosoftCalendarSourceId } from "@/lib/microsoft/calendars";
import {
  getMicrosoftEventNotes,
  patchMicrosoftEventNotes,
} from "@/lib/microsoft/patch-event-notes";
import {
  hasMicrosoftCalendarScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import type { AgendaItem } from "@/lib/dashboard/overview";

export const AGENDA_NOTES_TOMORROW_PREP_KEY =
  "agenda_notes_writeback_tomorrow_prep_ymd";

export type AgendaNotesWritebackSummary = {
  attempted: boolean;
  reason?: string;
  userId?: number;
  targetDate?: string;
  examined?: number;
  updatedGoogle?: number;
  updatedMicrosoft?: number;
  skipped?: number;
  errors?: number;
};

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

function enrichmentForItem(item: AgendaItem): AgendaNotesEnrichment {
  const weatherLabel = item.weather
    ? formatAgendaWeatherLabel(item.weather)
    : null;
  const driveLabel = item.driveLabel || null;
  let aiIconKey: string | null = null;
  if (shouldHaveAgendaAiIcon(item)) {
    const hit = lookupAgendaAiIconUrl({
      title: item.title,
      location: item.location,
      description: item.description,
      calendarType: item.calendarType,
      kind: item.kind,
    });
    aiIconKey = hit?.key ?? null;
  }
  return { weatherLabel, driveLabel, aiIconKey };
}

function parseGoogleAgendaEvent(
  item: AgendaItem
): { calendarId: string; eventId: string } | null {
  const calendarId = parseGoogleCalendarSourceId(item.calendarId || "");
  if (!calendarId || !item.id.startsWith("gcal-")) return null;
  const prefix = `gcal-${calendarId}-`;
  if (!item.id.startsWith(prefix)) return null;
  const eventId = item.id.slice(prefix.length);
  return eventId ? { calendarId, eventId } : null;
}

function parseMicrosoftAgendaEvent(
  item: AgendaItem
): { calendarId: string; eventId: string } | null {
  const calendarId = parseMicrosoftCalendarSourceId(item.calendarId || "");
  if (!calendarId || !item.id.startsWith("mscal-")) return null;
  const prefix = `mscal-${calendarId}-`;
  if (!item.id.startsWith(prefix)) return null;
  const eventId = item.id.slice(prefix.length);
  return eventId ? { calendarId, eventId } : null;
}

async function writeGoogleItem(
  userId: number,
  item: AgendaItem,
  enrichment: AgendaNotesEnrichment,
  request?: Request | null
): Promise<"updated" | "skipped" | "error"> {
  const ids = parseGoogleAgendaEvent(item);
  if (!ids) return "skipped";
  if (agendaNotesAlreadyWritten(item.description, enrichment, request)) {
    return "skipped";
  }
  const next = mergeAgendaNotesBlock(item.description, enrichment, request);
  if (next == null && !item.description?.includes("— Buddy —")) {
    return "skipped";
  }
  try {
    await patchGoogleEventDescription(
      userId,
      {
        calendarId: ids.calendarId,
        eventId: ids.eventId,
        description: next,
      },
      request
    );
    return "updated";
  } catch (error) {
    console.warn(
      "[agenda-notes] google patch:",
      ids.eventId,
      error instanceof Error ? error.message : error
    );
    return "error";
  }
}

async function writeMicrosoftItem(
  userId: number,
  item: AgendaItem,
  enrichment: AgendaNotesEnrichment,
  request?: Request | null
): Promise<"updated" | "skipped" | "error"> {
  const ids = parseMicrosoftAgendaEvent(item);
  if (!ids) return "skipped";
  try {
    const current = await getMicrosoftEventNotes(userId, ids.eventId);
    if (agendaNotesAlreadyWritten(current.text, enrichment, request)) {
      return "skipped";
    }
    const next = mergeAgendaNotesBlock(current.text, enrichment, request);
    if (next == null && !current.text.includes("— Buddy —")) {
      return "skipped";
    }
    await patchMicrosoftEventNotes(userId, {
      eventId: ids.eventId,
      notesText: next || "",
      contentType: current.contentType,
    });
    return "updated";
  } catch (error) {
    console.warn(
      "[agenda-notes] microsoft patch:",
      ids.eventId,
      error instanceof Error ? error.message : error
    );
    return "error";
  }
}

/**
 * Evening (~18:00 Zurich): write weather / drive / AI image link into
 * Google description + Outlook body for tomorrow's events.
 */
export async function syncAgendaNotesWritebackIfDue(options?: {
  force?: boolean;
  now?: Date;
  request?: Request | null;
  maxUpdates?: number;
}): Promise<AgendaNotesWritebackSummary> {
  const now = options?.now ?? new Date();
  const userId = findRolfAppUserId();
  if (userId == null) {
    return { attempted: false, reason: "no-user" };
  }

  const today = zurichYmd(now);
  const tomorrow = addDaysYmd(today, 1);
  const hour = zurichHour(now);
  const prepDone = getSetting(AGENDA_NOTES_TOMORROW_PREP_KEY) === tomorrow;
  const wantTomorrowPrep = hour >= 18 && !prepDone;

  if (!options?.force && !wantTomorrowPrep) {
    return { attempted: false, reason: "not-due", userId };
  }

  const canGoogle =
    isGoogleMailConnected(userId) &&
    hasGoogleCalendarEventsWriteScope(userId);
  const canMs =
    isMicrosoftConnected(userId) && hasMicrosoftCalendarScope(userId);

  if (!canGoogle && !canMs) {
    return { attempted: false, reason: "no-write-scope", userId };
  }

  const targetDate = tomorrow;

  try {
    const feed = await getCalendarAgenda({
      userId,
      range: "week",
      includeWeather: true,
    });

    const items = feed.items.filter((item) => item.date === targetDate);
    let updatedGoogle = 0;
    let updatedMicrosoft = 0;
    let skipped = 0;
    let errors = 0;
    const maxUpdates = Math.max(1, options?.maxUpdates ?? 40);
    let updates = 0;

    for (const item of items) {
      const enrichment = enrichmentForItem(item);
      if (
        !enrichment.weatherLabel &&
        !enrichment.driveLabel &&
        !enrichment.aiIconKey
      ) {
        skipped += 1;
        continue;
      }

      if (canGoogle && item.id.startsWith("gcal-")) {
        if (updates >= maxUpdates) break;
        const result = await writeGoogleItem(
          userId,
          item,
          enrichment,
          options?.request
        );
        if (result === "updated") {
          updatedGoogle += 1;
          updates += 1;
        } else if (result === "error") errors += 1;
        else skipped += 1;
        continue;
      }

      if (canMs && item.id.startsWith("mscal-")) {
        if (updates >= maxUpdates) break;
        const result = await writeMicrosoftItem(
          userId,
          item,
          enrichment,
          options?.request
        );
        if (result === "updated") {
          updatedMicrosoft += 1;
          updates += 1;
        } else if (result === "error") errors += 1;
        else skipped += 1;
      }
    }

    // Mark prep done when we finished the pass without hitting max mid-way
    // or when there was nothing left to update.
    const hitCap = updates >= maxUpdates;
    if (!hitCap || options?.force) {
      setSetting(AGENDA_NOTES_TOMORROW_PREP_KEY, tomorrow);
    }

    return {
      attempted: true,
      userId,
      targetDate,
      examined: items.length,
      updatedGoogle,
      updatedMicrosoft,
      skipped,
      errors,
    };
  } catch (error) {
    console.warn(
      "[agenda-notes] writeback failed:",
      error instanceof Error ? error.message : error
    );
    return {
      attempted: true,
      userId,
      targetDate,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
