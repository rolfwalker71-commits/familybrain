import { getSetting, setSetting } from "@/lib/db/migrations";
import type { MsDayMailAnalysis } from "@/lib/microsoft/analyze-mail-day";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import {
  isMailAnalysisYmd,
  mailAnalysisRangeKey,
  parseMailAnalysisRangeKey,
} from "@/lib/mail/mail-analysis-range";
import {
  toMailDayCachedSummary,
  type MailDayCachedSummary,
} from "@/lib/mail/mail-day-cache-summary";

export type MsMailDayJobStatus = "running" | "done" | "error";

export type MsMailDayJobMail = {
  inbox: MsMailItem[];
  sent: MsMailItem[];
  dayIso: string;
  fromYmd: string;
  toYmd: string;
  rangeKey: string;
};

export type MsMailDayJob = {
  userId: number;
  /** End day (compat / ritual). */
  dayIso: string;
  fromYmd: string;
  toYmd: string;
  rangeKey: string;
  status: MsMailDayJobStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  mail: MsMailDayJobMail | null;
  analysis: MsDayMailAnalysis | null;
};

/** Persistierte Analyse (ohne Mail-Bodies — Mails werden frisch geladen). */
export type MsMailDayCached = {
  /** End day — legacy single-day key also stored here. */
  dayIso: string;
  fromYmd: string;
  toYmd: string;
  rangeKey: string;
  finishedAt: string;
  analysis: MsDayMailAnalysis;
  inboxCount: number;
  sentCount: number;
};

export const MS_MAIL_DAY_CACHE_MAX = 7;

const STALE_RUNNING_MS = 12 * 60 * 1000;
const RANGE_KEY_RE = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;

function jobKey(userId: number): string {
  return `ms_mail_day_analysis_u${userId}`;
}

function cacheKey(userId: number): string {
  return `ms_mail_day_cache_u${userId}`;
}

function normalizeCached(raw: unknown): MsMailDayCached | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (!e.analysis || typeof e.analysis !== "object") return null;
  if (typeof e.finishedAt !== "string") return null;

  let fromYmd: string;
  let toYmd: string;
  let rangeKey: string;
  let dayIso: string;

  if (typeof e.rangeKey === "string" && RANGE_KEY_RE.test(e.rangeKey)) {
    const parsed = parseMailAnalysisRangeKey(e.rangeKey);
    if (!parsed) return null;
    fromYmd =
      typeof e.fromYmd === "string" && isMailAnalysisYmd(e.fromYmd)
        ? e.fromYmd
        : parsed.fromYmd;
    toYmd =
      typeof e.toYmd === "string" && isMailAnalysisYmd(e.toYmd)
        ? e.toYmd
        : parsed.toYmd;
    rangeKey = mailAnalysisRangeKey(fromYmd, toYmd);
    dayIso =
      typeof e.dayIso === "string" && isMailAnalysisYmd(e.dayIso)
        ? e.dayIso
        : toYmd;
  } else if (typeof e.dayIso === "string" && isMailAnalysisYmd(e.dayIso)) {
    fromYmd = e.dayIso;
    toYmd = e.dayIso;
    dayIso = e.dayIso;
    rangeKey = mailAnalysisRangeKey(fromYmd, toYmd);
  } else {
    return null;
  }

  return {
    dayIso,
    fromYmd,
    toYmd,
    rangeKey,
    finishedAt: e.finishedAt,
    analysis: e.analysis as MsDayMailAnalysis,
    inboxCount: Number(e.inboxCount) || 0,
    sentCount: Number(e.sentCount) || 0,
  };
}

function normalizeJob(raw: unknown, userId: number): MsMailDayJob | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as MsMailDayJob;
  if (parsed.userId !== userId) return null;
  if (!parsed.dayIso || typeof parsed.dayIso !== "string") return null;
  const fromYmd =
    parsed.fromYmd && isMailAnalysisYmd(parsed.fromYmd)
      ? parsed.fromYmd
      : parsed.dayIso;
  const toYmd =
    parsed.toYmd && isMailAnalysisYmd(parsed.toYmd)
      ? parsed.toYmd
      : parsed.dayIso;
  const rangeKey =
    parsed.rangeKey && RANGE_KEY_RE.test(parsed.rangeKey)
      ? parsed.rangeKey
      : mailAnalysisRangeKey(fromYmd, toYmd);
  return {
    ...parsed,
    fromYmd,
    toYmd,
    rangeKey,
    dayIso: parsed.dayIso || toYmd,
  };
}

export function readMsMailDayJob(userId: number): MsMailDayJob | null {
  const raw = getSetting(jobKey(userId));
  if (!raw) return null;
  try {
    return normalizeJob(JSON.parse(raw), userId);
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
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeCached)
      .filter((e): e is MsMailDayCached => Boolean(e));
  } catch {
    return [];
  }
}

/** Lookup by rangeKey or legacy single dayIso (`YYYY-MM-DD` → that day only). */
export function getMsMailDayCached(
  userId: number,
  rangeKeyOrDay: string
): MsMailDayCached | null {
  const key = rangeKeyOrDay.trim();
  const wantRange = RANGE_KEY_RE.test(key)
    ? key
    : isMailAnalysisYmd(key)
      ? mailAnalysisRangeKey(key, key)
      : null;
  if (!wantRange) return null;
  return (
    readMsMailDayCache(userId).find((e) => e.rangeKey === wantRange) || null
  );
}

/** Cached range keys (newest finishedAt first). */
export function listMsMailDayCachedDays(userId: number): string[] {
  return listMsMailDayCachedSummaries(userId).map((e) => e.rangeKey);
}

export function listMsMailDayCachedSummaries(
  userId: number
): MailDayCachedSummary[] {
  return readMsMailDayCache(userId)
    .slice()
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .map(toMailDayCachedSummary);
}

/** Speichert/aktualisiert eine Analyse; hält max. MS_MAIL_DAY_CACHE_MAX. */
export function upsertMsMailDayCache(
  userId: number,
  entry: MsMailDayCached,
  max = MS_MAIL_DAY_CACHE_MAX
): MsMailDayCached[] {
  const normalized = normalizeCached(entry);
  if (!normalized) return readMsMailDayCache(userId);
  const next = readMsMailDayCache(userId).filter(
    (e) => e.rangeKey !== normalized.rangeKey
  );
  next.push(normalized);
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
    fromYmd: cached.fromYmd,
    toYmd: cached.toYmd,
    rangeKey: cached.rangeKey,
    status: "done",
    startedAt: cached.finishedAt,
    finishedAt: cached.finishedAt,
    error: null,
    mail: null,
    analysis: cached.analysis,
  };
}

/** true wenn ein Lauf noch aktiv und nicht veraltet ist. */
export function isMsMailDayJobBusy(
  job: MsMailDayJob | null,
  rangeKey?: string
): boolean {
  if (!job || job.status !== "running") return false;
  const started = Date.parse(job.startedAt);
  if (!Number.isFinite(started) || Date.now() - started > STALE_RUNNING_MS) {
    return false;
  }
  if (rangeKey && job.rangeKey !== rangeKey) return true;
  return true;
}

export function startMsMailDayJob(
  userId: number,
  range: { fromYmd: string; toYmd: string; rangeKey: string; dayIso: string }
): MsMailDayJob {
  const job: MsMailDayJob = {
    userId,
    dayIso: range.dayIso,
    fromYmd: range.fromYmd,
    toYmd: range.toYmd,
    rangeKey: range.rangeKey,
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
  range: { fromYmd: string; toYmd: string; rangeKey: string; dayIso: string },
  mail: MsMailDayJobMail,
  analysis: MsDayMailAnalysis
): MsMailDayJob {
  const finishedAt = new Date().toISOString();
  const job: MsMailDayJob = {
    userId,
    dayIso: range.dayIso,
    fromYmd: range.fromYmd,
    toYmd: range.toYmd,
    rangeKey: range.rangeKey,
    status: "done",
    startedAt: readMsMailDayJob(userId)?.startedAt || finishedAt,
    finishedAt,
    error: null,
    mail,
    analysis,
  };
  writeMsMailDayJob(job);
  upsertMsMailDayCache(userId, {
    dayIso: range.dayIso,
    fromYmd: range.fromYmd,
    toYmd: range.toYmd,
    rangeKey: range.rangeKey,
    finishedAt,
    analysis,
    inboxCount: mail.inbox.filter((m) => m.inRange !== false).length,
    sentCount: mail.sent.filter((m) => m.inRange !== false).length,
  });
  return job;
}

export function finishMsMailDayJobError(
  userId: number,
  range: { fromYmd: string; toYmd: string; rangeKey: string; dayIso: string },
  error: string
): MsMailDayJob {
  const prev = readMsMailDayJob(userId);
  const job: MsMailDayJob = {
    userId,
    dayIso: range.dayIso,
    fromYmd: range.fromYmd,
    toYmd: range.toYmd,
    rangeKey: range.rangeKey,
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
