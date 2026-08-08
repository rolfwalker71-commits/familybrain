import { getSetting, setSetting } from "@/lib/db/migrations";
import type { MsDayMailAnalysis } from "@/lib/microsoft/analyze-mail-day";
import type { MsMailItem } from "@/lib/microsoft/mail-day";

export type GoogleMailDayJobStatus = "running" | "done" | "error";

export type GoogleMailDayJobMail = {
  inbox: MsMailItem[];
  sent: MsMailItem[];
  dayIso: string;
};

export type GoogleMailDayJob = {
  userId: number;
  dayIso: string;
  status: GoogleMailDayJobStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  mail: GoogleMailDayJobMail | null;
  analysis: MsDayMailAnalysis | null;
};

/** Persistierte Tagesanalyse (ohne Mail-Bodies — Mails werden frisch geladen). */
export type GoogleMailDayCached = {
  dayIso: string;
  finishedAt: string;
  analysis: MsDayMailAnalysis;
  inboxCount: number;
  sentCount: number;
};

export const GOOGLE_MAIL_DAY_CACHE_MAX = 7;

const STALE_RUNNING_MS = 12 * 60 * 1000;

function jobKey(userId: number): string {
  return `g_mail_day_analysis_u${userId}`;
}

function cacheKey(userId: number): string {
  return `g_mail_day_cache_u${userId}`;
}

export function readGoogleMailDayJob(userId: number): GoogleMailDayJob | null {
  const raw = getSetting(jobKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GoogleMailDayJob;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeGoogleMailDayJob(job: GoogleMailDayJob): void {
  setSetting(jobKey(job.userId), JSON.stringify(job));
}

export function clearGoogleMailDayJob(userId: number): void {
  setSetting(jobKey(userId), null);
}

export function readGoogleMailDayCache(userId: number): GoogleMailDayCached[] {
  const raw = getSetting(cacheKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as GoogleMailDayCached[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) =>
        e &&
        typeof e.dayIso === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(e.dayIso) &&
        e.analysis &&
        typeof e.analysis === "object"
    );
  } catch {
    return [];
  }
}

export function getGoogleMailDayCached(
  userId: number,
  dayIso: string
): GoogleMailDayCached | null {
  return readGoogleMailDayCache(userId).find((e) => e.dayIso === dayIso) || null;
}

export function listGoogleMailDayCachedDays(userId: number): string[] {
  return readGoogleMailDayCache(userId)
    .map((e) => e.dayIso)
    .sort((a, b) => b.localeCompare(a));
}

/** Speichert/aktualisiert eine Tagesanalyse; hält max. GOOGLE_MAIL_DAY_CACHE_MAX (nach finishedAt). */
export function upsertGoogleMailDayCache(
  userId: number,
  entry: GoogleMailDayCached,
  max = GOOGLE_MAIL_DAY_CACHE_MAX
): GoogleMailDayCached[] {
  const next = readGoogleMailDayCache(userId).filter(
    (e) => e.dayIso !== entry.dayIso
  );
  next.push(entry);
  next.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const pruned = next.slice(0, Math.max(1, max));
  setSetting(cacheKey(userId), JSON.stringify(pruned));
  return pruned;
}

export function cachedToJob(
  userId: number,
  cached: GoogleMailDayCached
): GoogleMailDayJob {
  return {
    userId,
    dayIso: cached.dayIso,
    status: "done",
    startedAt: cached.finishedAt,
    finishedAt: cached.finishedAt,
    error: null,
    mail: null,
    analysis: cached.analysis,
  };
}

/** true wenn ein anderer Lauf noch aktiv und nicht veraltet ist. */
export function isGoogleMailDayJobBusy(
  job: GoogleMailDayJob | null,
  dayIso?: string
): boolean {
  if (!job || job.status !== "running") return false;
  const started = Date.parse(job.startedAt);
  if (!Number.isFinite(started) || Date.now() - started > STALE_RUNNING_MS) {
    return false;
  }
  if (dayIso && job.dayIso !== dayIso) return true;
  return true;
}

export function startGoogleMailDayJob(
  userId: number,
  dayIso: string
): GoogleMailDayJob {
  const job: GoogleMailDayJob = {
    userId,
    dayIso,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    mail: null,
    analysis: null,
  };
  writeGoogleMailDayJob(job);
  return job;
}

export function finishGoogleMailDayJobOk(
  userId: number,
  dayIso: string,
  mail: GoogleMailDayJobMail,
  analysis: MsDayMailAnalysis
): GoogleMailDayJob {
  const finishedAt = new Date().toISOString();
  const job: GoogleMailDayJob = {
    userId,
    dayIso,
    status: "done",
    startedAt: readGoogleMailDayJob(userId)?.startedAt || finishedAt,
    finishedAt,
    error: null,
    mail,
    analysis,
  };
  writeGoogleMailDayJob(job);
  upsertGoogleMailDayCache(userId, {
    dayIso,
    finishedAt,
    analysis,
    inboxCount: mail.inbox.length,
    sentCount: mail.sent.length,
  });
  return job;
}

export function finishGoogleMailDayJobError(
  userId: number,
  dayIso: string,
  error: string
): GoogleMailDayJob {
  const prev = readGoogleMailDayJob(userId);
  const job: GoogleMailDayJob = {
    userId,
    dayIso,
    status: "error",
    startedAt: prev?.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error,
    mail: prev?.mail || null,
    analysis: null,
  };
  writeGoogleMailDayJob(job);
  return job;
}
