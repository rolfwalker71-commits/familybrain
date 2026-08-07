import { getSetting, setSetting } from "@/lib/db/migrations";
import type { MsDayMailAnalysis } from "@/lib/microsoft/analyze-mail-day";
import type { MsMailItem } from "@/lib/microsoft/mail-day";

export type MsMailDayJobStatus = "running" | "done" | "error";

export type MsMailDayJobMail = {
  inbox: MsMailItem[];
  sent: MsMailItem[];
  dayIso: string;
};

export type MsMailDayJob = {
  userId: number;
  dayIso: string;
  status: MsMailDayJobStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  mail: MsMailDayJobMail | null;
  analysis: MsDayMailAnalysis | null;
};

/** Persistierte Tagesanalyse (ohne Mail-Bodies — Mails werden frisch geladen). */
export type MsMailDayCached = {
  dayIso: string;
  finishedAt: string;
  analysis: MsDayMailAnalysis;
  inboxCount: number;
  sentCount: number;
};

export const MS_MAIL_DAY_CACHE_MAX = 7;

const STALE_RUNNING_MS = 12 * 60 * 1000;

function jobKey(userId: number): string {
  return `ms_mail_day_analysis_u${userId}`;
}

function cacheKey(userId: number): string {
  return `ms_mail_day_cache_u${userId}`;
}

export function readMsMailDayJob(userId: number): MsMailDayJob | null {
  const raw = getSetting(jobKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MsMailDayJob;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMsMailDayJob(job: MsMailDayJob): void {
  setSetting(jobKey(job.userId), JSON.stringify(job));
}

export function clearMsMailDayJob(userId: number): void {
  setSetting(jobKey(userId), null);
}

export function readMsMailDayCache(userId: number): MsMailDayCached[] {
  const raw = getSetting(cacheKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as MsMailDayCached[];
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

export function getMsMailDayCached(
  userId: number,
  dayIso: string
): MsMailDayCached | null {
  return readMsMailDayCache(userId).find((e) => e.dayIso === dayIso) || null;
}

export function listMsMailDayCachedDays(userId: number): string[] {
  return readMsMailDayCache(userId)
    .map((e) => e.dayIso)
    .sort((a, b) => b.localeCompare(a));
}

/** Speichert/aktualisiert eine Tagesanalyse; hält max. MS_MAIL_DAY_CACHE_MAX (nach finishedAt). */
export function upsertMsMailDayCache(
  userId: number,
  entry: MsMailDayCached,
  max = MS_MAIL_DAY_CACHE_MAX
): MsMailDayCached[] {
  const next = readMsMailDayCache(userId).filter(
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
  cached: MsMailDayCached
): MsMailDayJob {
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
export function isMsMailDayJobBusy(
  job: MsMailDayJob | null,
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

export function startMsMailDayJob(
  userId: number,
  dayIso: string
): MsMailDayJob {
  const job: MsMailDayJob = {
    userId,
    dayIso,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    mail: null,
    analysis: null,
  };
  writeMsMailDayJob(job);
  return job;
}

export function finishMsMailDayJobOk(
  userId: number,
  dayIso: string,
  mail: MsMailDayJobMail,
  analysis: MsDayMailAnalysis
): MsMailDayJob {
  const finishedAt = new Date().toISOString();
  const job: MsMailDayJob = {
    userId,
    dayIso,
    status: "done",
    startedAt: readMsMailDayJob(userId)?.startedAt || finishedAt,
    finishedAt,
    error: null,
    mail,
    analysis,
  };
  writeMsMailDayJob(job);
  upsertMsMailDayCache(userId, {
    dayIso,
    finishedAt,
    analysis,
    inboxCount: mail.inbox.length,
    sentCount: mail.sent.length,
  });
  return job;
}

export function finishMsMailDayJobError(
  userId: number,
  dayIso: string,
  error: string
): MsMailDayJob {
  const prev = readMsMailDayJob(userId);
  const job: MsMailDayJob = {
    userId,
    dayIso,
    status: "error",
    startedAt: prev?.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error,
    mail: prev?.mail || null,
    analysis: null,
  };
  writeMsMailDayJob(job);
  return job;
}
