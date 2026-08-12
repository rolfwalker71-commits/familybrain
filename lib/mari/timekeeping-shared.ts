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
  /** Kunden-/Projektname (Matchcode), wenn bekannt — UI: «Kunde (P…)». */
  projectCustomer: string | null;
  phaseId: number;
  activity: string;
  memo: string | null;
  /** USER_ND_Int_Bemerkung_Verr — Interne Bemerkung zur Verrechnung */
  internalRemarkVerr: string | null;
  /** USER_Begruendung — Grund für Nullerstunden */
  zeroHoursReason: string | null;
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

/** Anzeige «Kunde (Projektnummer)» — ohne Doppelung, wenn Name die Nummer schon enthält. */
export function formatMariProjectLabel(
  projectNumber: string | null | undefined,
  customerOrName?: string | null
): string {
  const pn = (projectNumber || "").trim();
  const name = (customerOrName || "").trim();
  if (!pn && !name) return "–";
  if (!name) return pn;
  if (!pn) return name;
  if (
    name === pn ||
    name.includes(`(${pn})`) ||
    name.endsWith(` ${pn}`) ||
    name.startsWith(`${pn} `)
  ) {
    return name;
  }
  return `${name} (${pn})`;
}

/**
 * True for MARI project numbers (e.g. P600014). Rejects customer names / CardCodes
 * so Kopf-Formulare nicht mit Matchcode vorbelegt werden.
 */
export function looksLikeMariProjectNumber(
  raw: string | null | undefined
): boolean {
  const t = (raw || "").trim();
  if (!t || /\s/.test(t)) return false;
  if (/^P\d{3,}$/i.test(t)) return true;
  // manche Mandanten nutzen rein numerische Projektkeys
  if (/^\d{4,}$/.test(t)) return true;
  return false;
}

export function sanitizeMariProjectNumber(
  projectNumber: string | null | undefined,
  opts?: { addressMatchcode?: string | null; cardCode?: string | null }
): string | null {
  const pn = (projectNumber || "").trim();
  if (!pn) return null;
  const am = (opts?.addressMatchcode || "").trim();
  const cc = (opts?.cardCode || "").trim();
  if (am && pn === am) return null;
  if (cc && pn === cc) return null;
  if (!looksLikeMariProjectNumber(pn)) return null;
  return pn;
}

/** MARI-Sentinel «01.01.0001» / leere DueDate → null. */
export function normalizeMariDueDate(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  const d = raw.trim();
  const ymd = d.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const y = Number(ymd.slice(0, 4));
  if (!Number.isFinite(y) || y < 1900) return null;
  return d;
}

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

/** Ankerdatum um einen Zeitraum verschieben (Tag/Woche/Monat/Quartal). */
export function shiftTimePeriodAnchor(
  anchorYmd: string,
  period: MariTimePeriod,
  steps: number
): string {
  assertYmd(anchorYmd);
  if (period === "day") return addDaysYmd(anchorYmd, steps);
  if (period === "week") return addDaysYmd(anchorYmd, steps * 7);

  const range = resolveTimePeriodRange(anchorYmd, period);
  const { y, m } = parseYmdParts(range.fromDate);
  const monthDelta = period === "month" ? steps : steps * 3;
  const dt = new Date(Date.UTC(y, m - 1 + monthDelta, 1));
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1);
}
