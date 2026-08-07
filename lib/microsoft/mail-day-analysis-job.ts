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

const STALE_RUNNING_MS = 12 * 60 * 1000;

function jobKey(userId: number): string {
  return `ms_mail_day_analysis_u${userId}`;
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
  const job: MsMailDayJob = {
    userId,
    dayIso,
    status: "done",
    startedAt: readMsMailDayJob(userId)?.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: null,
    mail,
    analysis,
  };
  writeMsMailDayJob(job);
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
