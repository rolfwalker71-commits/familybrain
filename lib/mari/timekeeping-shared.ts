/** Client-sichere Typen & Pure Helpers für MARI-Zeiterfassung (kein Node/SQLite). */

export const TIMEKEEPING_SOURCE_SUPPORT_ISSUE = 2;

export type MariKeyPair = {
  matchcode: string;
  keyVisible: string;
  keyInternal: string;
  indent: number;
  indentParent: boolean;
};

/** MARI ApprovalMode: 0 erfasst, -1 freigegeben, 2 Vorerfassung, 3 abgelehnt. */
export type MariApprovalStatus =
  | "recorded"
  | "approved"
  | "draft"
  | "rejected"
  | "unknown";

export type MariTimePeriod = "day" | "week" | "month" | "quarter";

export type MariTimeLine = {
  lineId: number;
  serviceDate: string;
  employeeNumber: string;
  employeeName: string | null;
  projectNumber: string;
  phaseId: number;
  activity: string;
  memo: string | null;
  hours: number;
  hoursBillable: number;
  billable: boolean;
  contractId: number;
  sourceType: number;
  sourceReference: number;
  timeStart: string | null;
  timeEnd: string | null;
  createDate: string | null;
  approvalMode: number;
  approvalStatus: MariApprovalStatus;
  /** true wenn ApprovalMode === -1 (freigegeben). */
  approved: boolean;
  /** Optional MARI-Hinweis (z.B. Warnings nach erfolgreichem Import). */
  warning?: string | null;
};

export type MariDayTimeSummary = {
  date: string;
  period: MariTimePeriod;
  fromDate: string;
  toDate: string;
  lines: MariTimeLine[];
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
};

export function mapApprovalMode(raw: unknown): {
  approvalMode: number;
  approvalStatus: MariApprovalStatus;
  approved: boolean;
} {
  const approvalMode = Number(raw);
  const mode = Number.isFinite(approvalMode) ? approvalMode : NaN;
  let approvalStatus: MariApprovalStatus = "unknown";
  if (mode === -1) approvalStatus = "approved";
  else if (mode === 0) approvalStatus = "recorded";
  else if (mode === 2) approvalStatus = "draft";
  else if (mode === 3) approvalStatus = "rejected";
  return {
    approvalMode: Number.isFinite(mode) ? mode : 0,
    approvalStatus,
    approved: mode === -1,
  };
}

export function approvalStatusLabel(status: MariApprovalStatus): string {
  switch (status) {
    case "approved":
      return "Freigegeben";
    case "recorded":
      return "Erfasst";
    case "draft":
      return "Vorerfassung";
    case "rejected":
      return "Abgelehnt";
    default:
      return "Unbekannt";
  }
}

function parseYmdParts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

function formatYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function assertYmd(ymd: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error("Datum ungültig (YYYY-MM-DD).");
  }
}

/** Kalendertag + n Tage (UTC-Datumsteile, ohne TZ-Drift). */
export function addDaysYmd(ymd: string, days: number): string {
  const { y, m, d } = parseYmdParts(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Zeitraum um Ankerdatum: Tag, ISO-Woche (Mo–So), Monat, Kalenderquartal.
 */
export function resolveTimePeriodRange(
  anchorYmd: string,
  period: MariTimePeriod
): { fromDate: string; toDate: string; toExclusive: string } {
  assertYmd(anchorYmd);
  const { y, m, d } = parseYmdParts(anchorYmd);

  if (period === "day") {
    return {
      fromDate: anchorYmd,
      toDate: anchorYmd,
      toExclusive: addDaysYmd(anchorYmd, 1),
    };
  }

  if (period === "week") {
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=So
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const fromDate = addDaysYmd(anchorYmd, mondayOffset);
    const toDate = addDaysYmd(fromDate, 6);
    return { fromDate, toDate, toExclusive: addDaysYmd(toDate, 1) };
  }

  if (period === "month") {
    const fromDate = formatYmd(y, m, 1);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const toDate = formatYmd(y, m, lastDay);
    return { fromDate, toDate, toExclusive: addDaysYmd(toDate, 1) };
  }

  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const fromDate = formatYmd(y, qStartMonth, 1);
  const qEndMonth = qStartMonth + 2;
  const lastDay = new Date(Date.UTC(y, qEndMonth, 0)).getUTCDate();
  const toDate = formatYmd(y, qEndMonth, lastDay);
  return { fromDate, toDate, toExclusive: addDaysYmd(toDate, 1) };
}

function toSwissDateLocal(ymd: string): string {
  const { y, m, d } = parseYmdParts(ymd);
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

export function formatPeriodLabel(
  period: MariTimePeriod,
  fromDate: string,
  toDate: string
): string {
  if (period === "day") return toSwissDateLocal(fromDate);
  if (fromDate === toDate) return toSwissDateLocal(fromDate);
  return `${toSwissDateLocal(fromDate)} – ${toSwissDateLocal(toDate)}`;
}
