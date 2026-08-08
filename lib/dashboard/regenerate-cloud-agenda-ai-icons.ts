import { findRolfAppUserId } from "@/lib/calendar/ics-calendars";
import { getCalendarAgenda } from "@/lib/calendar/agenda-feed";
import { hasOpenAIKey } from "@/lib/ai/client";
import {
  buildAgendaAiIconKey,
  ensureAgendaAiIcon,
  isCloudCalendarAgendaId,
  shouldHaveAgendaAiIcon,
  type AgendaIconSubject,
} from "@/lib/dashboard/agenda-ai-icon";

export type RegenerateCloudAgendaAiIconsSummary = {
  attempted: boolean;
  reason?: string;
  examined?: number;
  unique?: number;
  generated?: number;
  errors?: number;
};

function subjectFromAgendaItem(item: {
  title: string;
  location?: string | null;
  description?: string | null;
  calendarType?: string | null;
  kind?: string | null;
  calendarName?: string | null;
  meetUrl?: string | null;
  time?: string | null;
  endTime?: string | null;
  driveMinutes?: number | null;
  distanceKm?: number | null;
  coords?: { lat: number; lon: number; label?: string } | null;
}): AgendaIconSubject {
  return {
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
}

/**
 * Force-regenerate AI icons for Google + Microsoft agenda items in the
 * current week (+ tomorrow). ICS / holidays / Buddy-local are skipped.
 */
export async function regenerateCloudAgendaAiIcons(options?: {
  maxGenerate?: number;
  userId?: number | null;
}): Promise<RegenerateCloudAgendaAiIconsSummary> {
  if (!hasOpenAIKey()) {
    return { attempted: false, reason: "no-openai" };
  }
  const userId =
    options?.userId !== undefined ? options.userId : findRolfAppUserId();
  if (userId == null) {
    return { attempted: false, reason: "no-user" };
  }

  const feed = await getCalendarAgenda({
    userId,
    range: "week",
    includeWeather: true,
  });

  const subjects = new Map<string, AgendaIconSubject>();
  let examined = 0;
  for (const item of feed.items) {
    if (!isCloudCalendarAgendaId(item.id)) continue;
    if (!shouldHaveAgendaAiIcon(item)) continue;
    examined += 1;
    const subject = subjectFromAgendaItem(item);
    const key = buildAgendaAiIconKey(subject);
    if (!key) continue;
    if (!subjects.has(key)) subjects.set(key, subject);
  }

  let generated = 0;
  let errors = 0;
  const maxGenerate = Math.max(1, options?.maxGenerate ?? 24);

  for (const subject of subjects.values()) {
    if (generated >= maxGenerate) break;
    try {
      const result = await ensureAgendaAiIcon(subject, { force: true });
      if (result?.generated) generated += 1;
    } catch (err) {
      errors += 1;
      console.warn(
        "[agenda-ai-icon] regenerate:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    attempted: true,
    examined,
    unique: subjects.size,
    generated,
    errors,
  };
}
