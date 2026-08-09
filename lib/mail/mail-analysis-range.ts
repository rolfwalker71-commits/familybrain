import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";

/** Max inclusive calendar days for one mail analysis run. */
export const MAIL_ANALYSIS_RANGE_MAX_DAYS = 7;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const RANGE_KEY_RE = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;

export function isMailAnalysisYmd(value: string | null | undefined): value is string {
  return Boolean(value && YMD_RE.test(value));
}

export function mailAnalysisRangeKey(fromYmd: string, toYmd: string): string {
  return `${fromYmd}_${toYmd}`;
}

export function parseMailAnalysisRangeKey(
  key: string
): { fromYmd: string; toYmd: string } | null {
  const m = RANGE_KEY_RE.exec(key.trim());
  if (!m) return null;
  return { fromYmd: m[1]!, toYmd: m[2]! };
}

/** Inclusive day count (from=to → 1). */
export function mailAnalysisRangeDayCount(fromYmd: string, toYmd: string): number {
  const start = Date.parse(`${fromYmd}T12:00:00Z`);
  const end = Date.parse(`${toYmd}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export type MailAnalysisRange = {
  fromYmd: string;
  toYmd: string;
  rangeKey: string;
  /** Compat: end day (ritual / legacy dayIso). */
  dayIso: string;
  dayCount: number;
};

/**
 * Resolve from/to (or legacy single `date`) to a validated Zurich range.
 * Default: today–today.
 */
export function resolveMailAnalysisRange(input?: {
  from?: string | null;
  to?: string | null;
  date?: string | null;
}): MailAnalysisRange | { error: string } {
  const today = zurichYmd();
  const date = input?.date && isMailAnalysisYmd(input.date) ? input.date : null;
  const fromIn = input?.from && isMailAnalysisYmd(input.from) ? input.from : null;
  const toIn = input?.to && isMailAnalysisYmd(input.to) ? input.to : null;

  let fromYmd: string;
  let toYmd: string;
  if (fromIn || toIn) {
    fromYmd = fromIn || toIn!;
    toYmd = toIn || fromIn!;
  } else if (date) {
    fromYmd = date;
    toYmd = date;
  } else {
    fromYmd = today;
    toYmd = today;
  }

  if (toYmd < fromYmd) {
    const tmp = fromYmd;
    fromYmd = toYmd;
    toYmd = tmp;
  }

  const dayCount = mailAnalysisRangeDayCount(fromYmd, toYmd);
  if (dayCount < 1) {
    return { error: "Ungültiger Analysezeitraum." };
  }
  if (dayCount > MAIL_ANALYSIS_RANGE_MAX_DAYS) {
    return {
      error: `Analysezeitraum max. ${MAIL_ANALYSIS_RANGE_MAX_DAYS} Tage.`,
    };
  }

  return {
    fromYmd,
    toYmd,
    rangeKey: mailAnalysisRangeKey(fromYmd, toYmd),
    dayIso: toYmd,
    dayCount,
  };
}

/** Inbox/sent list caps — slightly higher for multi-day (Gmail maxResults ≤ 50). */
export function mailAnalysisListLimits(dayCount: number): {
  inboxLimit: number;
  sentLimit: number;
} {
  if (dayCount <= 1) return { inboxLimit: 25, sentLimit: 15 };
  return {
    inboxLimit: Math.min(50, 30 + (dayCount - 1) * 4),
    sentLimit: Math.min(40, 18 + (dayCount - 1) * 3),
  };
}

export function formatMailAnalysisRangeLabel(range: {
  fromYmd: string;
  toYmd: string;
}): string {
  if (range.fromYmd === range.toYmd) return range.fromYmd;
  return `${range.fromYmd}–${range.toYmd}`;
}

/** Exclusive upper bound YMD for Gmail `before:` / Graph `lt`. */
export function mailAnalysisRangeExclusiveEnd(toYmd: string): string {
  return addDaysYmd(toYmd, 1);
}
