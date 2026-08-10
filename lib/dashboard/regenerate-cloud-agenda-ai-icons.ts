import { findRolfAppUserId } from "@/lib/calendar/ics-calendars";
import { getCalendarAgenda } from "@/lib/calendar/agenda-feed";
import { hasOpenAIKey } from "@/lib/ai/client";
import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  buildAgendaAiIconKey,
  ensureAgendaAiIcon,
  isCloudCalendarAgendaId,
  shouldHaveAgendaAiIcon,
  type AgendaIconSubject,
} from "@/lib/dashboard/agenda-ai-icon";

export const AGENDA_AI_REGEN_JOB_KEY = "agenda_ai_icons_regen_job";

export type RegenerateCloudAgendaAiIconsSummary = {
  attempted: boolean;
  reason?: string;
  examined?: number;
  unique?: number;
  generated?: number;
  errors?: number;
};

export type AgendaAiRegenJob = {
  status: "running" | "done" | "error";
  startedAt: string;
  finishedAt?: string | null;
  maxGenerate: number;
  userId: number | null;
  examined?: number;
  unique?: number;
  generated?: number;
  errors?: number;
  /** How many unique subjects processed so far (running progress). */
  processed?: number;
  message?: string | null;
  error?: string | null;
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

export function readAgendaAiRegenJob(): AgendaAiRegenJob | null {
  const raw = getSetting(AGENDA_AI_REGEN_JOB_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AgendaAiRegenJob;
    if (
      !parsed ||
      (parsed.status !== "running" &&
        parsed.status !== "done" &&
        parsed.status !== "error")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isAgendaAiRegenJobBusy(
  job: AgendaAiRegenJob | null = readAgendaAiRegenJob()
): boolean {
  if (!job || job.status !== "running") return false;
  const started = new Date(job.startedAt).getTime();
  // Stale lock (crash / killed process) after 25 min
  if (!Number.isFinite(started) || Date.now() - started > 25 * 60 * 1000) {
    return false;
  }
  return true;
}

function writeAgendaAiRegenJob(job: AgendaAiRegenJob): void {
  setSetting(AGENDA_AI_REGEN_JOB_KEY, JSON.stringify(job));
}

/**
 * Force-regenerate AI icons for Google + Microsoft agenda items in the
 * current week. ICS / holidays / Buddy-local are skipped.
 */
export async function regenerateCloudAgendaAiIcons(options?: {
  maxGenerate?: number;
  userId?: number | null;
  onProgress?: (partial: {
    examined: number;
    unique: number;
    generated: number;
    errors: number;
    processed: number;
  }) => void;
}): Promise<RegenerateCloudAgendaAiIconsSummary> {
  if (!hasOpenAIKey()) {
    return { attempted: false, reason: "no-openai" };
  }
  const userId =
    options?.userId != null ? options.userId : findRolfAppUserId();
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
  let processed = 0;
  const maxGenerate = Math.max(1, options?.maxGenerate ?? 24);
  const unique = subjects.size;

  options?.onProgress?.({
    examined,
    unique,
    generated,
    errors,
    processed,
  });

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
    processed += 1;
    options?.onProgress?.({
      examined,
      unique,
      generated,
      errors,
      processed,
    });
  }

  return {
    attempted: true,
    examined,
    unique,
    generated,
    errors,
  };
}

/** Starts job record; caller should schedule runAgendaAiRegenJob via `after()`. */
export function beginAgendaAiRegenJob(input: {
  maxGenerate: number;
  userId: number | null;
}): AgendaAiRegenJob {
  const job: AgendaAiRegenJob = {
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    maxGenerate: input.maxGenerate,
    userId: input.userId,
    examined: 0,
    unique: 0,
    generated: 0,
    errors: 0,
    processed: 0,
    message: "Neugenerierung gestartet…",
    error: null,
  };
  writeAgendaAiRegenJob(job);
  return job;
}

/** Background worker: updates job state until done/error. */
export async function runAgendaAiRegenJob(input: {
  maxGenerate: number;
  userId: number | null;
}): Promise<void> {
  const base = readAgendaAiRegenJob();
  const patch = (partial: Partial<AgendaAiRegenJob>) => {
    const current = readAgendaAiRegenJob() || base;
    if (!current) return;
    writeAgendaAiRegenJob({ ...current, ...partial });
  };

  try {
    const summary = await regenerateCloudAgendaAiIcons({
      maxGenerate: input.maxGenerate,
      userId: input.userId,
      onProgress: (p) => {
        patch({
          examined: p.examined,
          unique: p.unique,
          generated: p.generated,
          errors: p.errors,
          processed: p.processed,
          message:
            p.unique > 0
              ? `Generiere… ${p.processed}/${Math.min(p.unique, input.maxGenerate)} Motive`
              : "Lade Kalender…",
        });
      },
    });

    if (!summary.attempted) {
      const reason =
        summary.reason === "no-openai"
          ? "OpenAI API-Key fehlt."
          : summary.reason === "no-user"
            ? "Kein Benutzer für Kalender gefunden."
            : summary.reason || "nicht gestartet";
      patch({
        status: "error",
        finishedAt: new Date().toISOString(),
        error: reason,
        message: reason,
      });
      return;
    }

    const msg =
      `Fertig: ${summary.generated ?? 0} neu erzeugt` +
      (summary.unique != null ? ` (${summary.unique} Motive)` : "") +
      (summary.errors ? `, ${summary.errors} Fehler` : "") +
      ".";

    patch({
      status: "done",
      finishedAt: new Date().toISOString(),
      examined: summary.examined,
      unique: summary.unique,
      generated: summary.generated,
      errors: summary.errors,
      processed: summary.unique,
      message: msg,
      error: null,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn("[agenda-ai-icon] regen job failed:", error);
    patch({
      status: "error",
      finishedAt: new Date().toISOString(),
      error,
      message: error,
    });
  }
}
