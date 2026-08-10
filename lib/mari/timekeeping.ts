import { z } from "zod";
import {
  MariApiError,
  mariJson,
  mariSql,
  requireMariConfig,
} from "@/lib/mari/client";
import { normalizeMariEmployeeNumber } from "@/lib/mari/tickets";

/** Support-Ticket → Zeile (HotlineClassType 17). */
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

export type MariTimeLineCreateInput = {
  dayOfService: string;
  projectNumber: string;
  activity: string;
  memoText?: string | null;
  hours: number;
  hoursBillable: number;
  contractId: number;
  contractPositionId?: number | null;
  issueId?: number | null;
  employeeNumber?: string | null;
  /** Ignored — immer 0 (Phase wird bei ANG nicht genutzt). */
  phaseId?: number | null;
};

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const MariTimeLineCreateSchema = z.object({
  dayOfService: Ymd,
  projectNumber: z.string().trim().min(1).max(40),
  activity: z.string().trim().min(1).max(100),
  memoText: z.string().trim().max(2000).nullable().optional(),
  hours: z.number().min(0.01).max(24),
  hoursBillable: z.number().min(0).max(24),
  contractId: z.number().int().nonnegative(),
  contractPositionId: z.number().int().nonnegative().nullable().optional(),
  issueId: z.number().int().positive().nullable().optional(),
  employeeNumber: z.string().trim().max(20).nullable().optional(),
  phaseId: z.number().int().nonnegative().optional(),
});

type RawKeyPair = {
  sMatchcode?: string | null;
  sKeyVisible?: string | null;
  sKeyInternal?: string | null;
  nIndent?: number | null;
  bIndentParent?: boolean | null;
};

function mapKeyPair(raw: RawKeyPair): MariKeyPair | null {
  const keyInternal = String(raw.sKeyInternal || "").trim();
  const matchcode = String(raw.sMatchcode || "").trim();
  if (!keyInternal && !matchcode) return null;
  return {
    matchcode: matchcode || keyInternal,
    keyVisible: String(raw.sKeyVisible || "").trim(),
    keyInternal: keyInternal || matchcode,
    indent: Number(raw.nIndent) || 0,
    indentParent: Boolean(raw.bIndentParent),
  };
}

function normalizeSearchQuery(q: string | null | undefined): string {
  return (q || "")
    .trim()
    .replace(/^\*+|\*+$/g, "")
    .toLowerCase();
}

function matchesSearch(item: MariKeyPair, q: string): boolean {
  if (!q) return true;
  const hay =
    `${item.matchcode} ${item.keyVisible} ${item.keyInternal}`.toLowerCase();
  return hay.includes(q);
}

function toDayIso(ymd: string): string {
  return `${ymd}T00:00:00`;
}

function roundHours(n: number): number {
  return Math.round(n * 100) / 100;
}

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
  Ymd.parse(anchorYmd);
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

  // quarter
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const fromDate = formatYmd(y, qStartMonth, 1);
  const qEndMonth = qStartMonth + 2;
  const lastDay = new Date(Date.UTC(y, qEndMonth, 0)).getUTCDate();
  const toDate = formatYmd(y, qEndMonth, lastDay);
  return { fromDate, toDate, toExclusive: addDaysYmd(toDate, 1) };
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

function toSwissDateLocal(ymd: string): string {
  const { y, m, d } = parseYmdParts(ymd);
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

const TIME_LINE_SQL_SELECT = `
  t."TimeSheetEntryID",
  t."ServiceDate",
  t."EmployeeNumber",
  e."Matchcode" AS "EmployeeMatchcode",
  e."EmployeeName",
  t."ProjectNumber",
  t."PhaseID",
  t."ActivityText",
  t."Memo",
  t."Quantity",
  t."InvQty",
  t."SourceType",
  t."SourceReference",
  t."TimeStart",
  t."TimeEnd",
  t."CreateDate",
  t."ApprovalMode"
`;

function mapSqlLine(r: Record<string, unknown>): MariTimeLine {
  const hours = Number(r.Quantity) || 0;
  const hoursBillable = Number(r.InvQty) || 0;
  const serviceDateRaw = String(r.ServiceDate || "");
  const serviceDate = serviceDateRaw.slice(0, 10);
  const approval = mapApprovalMode(r.ApprovalMode);
  return {
    lineId: Number(r.TimeSheetEntryID) || 0,
    serviceDate,
    employeeNumber: String(r.EmployeeNumber || ""),
    employeeName:
      String(r.EmployeeName || r.EmployeeMatchcode || "").trim() || null,
    projectNumber: String(r.ProjectNumber || ""),
    phaseId: Number(r.PhaseID) || 0,
    activity: String(r.ActivityText || "").trim(),
    memo: String(r.Memo || "").trim() || null,
    hours,
    hoursBillable,
    billable: hoursBillable > 0,
    contractId: Number(r.ContractID) || 0,
    sourceType: Number(r.SourceType) || 0,
    sourceReference: Number(r.SourceReference) || 0,
    timeStart: r.TimeStart ? String(r.TimeStart) : null,
    timeEnd: r.TimeEnd ? String(r.TimeEnd) : null,
    createDate: r.CreateDate ? String(r.CreateDate) : null,
    ...approval,
  };
}

function summarizeLines(
  anchorDate: string,
  period: MariTimePeriod,
  fromDate: string,
  toDate: string,
  lines: MariTimeLine[]
): MariDayTimeSummary {
  const totalHours = roundHours(lines.reduce((s, l) => s + l.hours, 0));
  const billableHours = roundHours(
    lines.reduce((s, l) => s + l.hoursBillable, 0)
  );
  return {
    date: anchorDate,
    period,
    fromDate,
    toDate,
    lines,
    totalHours,
    billableHours,
    nonBillableHours: roundHours(Math.max(0, totalHours - billableHours)),
  };
}

export async function listProjectsForTimeBooking(input?: {
  employeeNumber?: string | null;
  q?: string | null;
}): Promise<MariKeyPair[]> {
  const cfg = requireMariConfig();
  const emp =
    normalizeMariEmployeeNumber(input?.employeeNumber) ||
    normalizeMariEmployeeNumber(cfg.employeeNumber);
  if (!emp) {
    throw new MariApiError("Personalnummer ungültig.", 400);
  }
  const raw = await mariJson<RawKeyPair[]>(
    `/api/ProjectListForTimeBooking/${encodeURIComponent(emp)}`
  );
  const q = normalizeSearchQuery(input?.q);
  const all = (Array.isArray(raw) ? raw : [])
    .map(mapKeyPair)
    .filter((x): x is MariKeyPair => x != null);
  if (!q) return all;
  return all.filter((p) => matchesSearch(p, q));
}

export async function listPhasesForTimeBooking(
  projectNumber: string
): Promise<MariKeyPair[]> {
  requireMariConfig();
  const pn = projectNumber.trim();
  if (!pn) throw new MariApiError("Projektnummer fehlt.", 400);
  const raw = await mariJson<RawKeyPair[]>(
    `/api/ProjectListPhasesForTimeBooking/${encodeURIComponent(pn)}`
  );
  return (Array.isArray(raw) ? raw : [])
    .map(mapKeyPair)
    .filter((x): x is MariKeyPair => x != null && Boolean(x.keyInternal));
}

export async function listContractsForProject(
  projectNumber: string,
  activeOnly = true
): Promise<MariKeyPair[]> {
  requireMariConfig();
  const pn = projectNumber.trim();
  if (!pn) throw new MariApiError("Projektnummer fehlt.", 400);
  const raw = await mariJson<RawKeyPair[]>(
    `/api/ProjectListContracts/${encodeURIComponent(pn)}/${
      activeOnly ? "true" : "false"
    }`
  );
  return (Array.isArray(raw) ? raw : [])
    .map(mapKeyPair)
    .filter((x): x is MariKeyPair => x != null && Boolean(x.keyInternal));
}

export async function listContractPositionsForTimeKeeping(
  contractId: number
): Promise<MariKeyPair[]> {
  requireMariConfig();
  if (!Number.isInteger(contractId) || contractId <= 0) {
    throw new MariApiError("Vertrags-ID ungültig.", 400);
  }
  const raw = await mariJson<RawKeyPair[]>(
    `/api/ContractListPositionsForTimeKeeping/${contractId}`
  );
  return (Array.isArray(raw) ? raw : [])
    .map(mapKeyPair)
    .filter((x): x is MariKeyPair => x != null && Boolean(x.keyInternal));
}

export async function listTimeLinesForDay(input: {
  dateYmd: string;
  period?: MariTimePeriod;
  employeeNumber?: string | null;
}): Promise<MariDayTimeSummary> {
  const cfg = requireMariConfig();
  const emp =
    normalizeMariEmployeeNumber(input.employeeNumber) ||
    normalizeMariEmployeeNumber(cfg.employeeNumber);
  if (!emp) throw new MariApiError("Personalnummer ungültig.", 400);
  const ymd = Ymd.parse(input.dateYmd);
  const period = input.period || "day";
  const { fromDate, toDate, toExclusive } = resolveTimePeriodRange(ymd, period);
  const empQ = emp.replace(/'/g, "''");
  const top = period === "day" ? 200 : 2000;
  const rows = await mariSql<Record<string, unknown>>(
    `SELECT TOP ${top}
${TIME_LINE_SQL_SELECT}
FROM "MARIProjectTimeKeepingLines" t
LEFT JOIN "MARIEmployeeMaster" e
  ON e."EmployeeNumber" = t."EmployeeNumber"
WHERE t."EmployeeNumber" = '${empQ}'
  AND t."ServiceDate" >= '${fromDate}'
  AND t."ServiceDate" < '${toExclusive}'
ORDER BY t."ServiceDate", t."TimeSheetEntryID"`
  );
  const lines = rows
    .map(mapSqlLine)
    .filter(
      (l) =>
        l.lineId > 0 &&
        l.serviceDate >= fromDate &&
        l.serviceDate <= toDate
    );
  return summarizeLines(ymd, period, fromDate, toDate, lines);
}

export async function listTimeLinesForTicket(
  issueId: number
): Promise<MariTimeLine[]> {
  requireMariConfig();
  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new MariApiError("Ticket-ID ungültig.", 400);
  }
  const rows = await mariSql<Record<string, unknown>>(
    `SELECT TOP 200
${TIME_LINE_SQL_SELECT}
FROM "MARIProjectTimeKeepingLines" t
LEFT JOIN "MARIEmployeeMaster" e
  ON e."EmployeeNumber" = t."EmployeeNumber"
WHERE t."SourceReference" = ${issueId}
  AND t."SourceType" IN (2, 3)
ORDER BY t."ServiceDate" DESC, t."TimeSheetEntryID" DESC`
  );
  return rows.map(mapSqlLine).filter((l) => l.lineId > 0);
}

export async function createTimeKeepingLine(
  input: MariTimeLineCreateInput
): Promise<MariTimeLine> {
  const cfg = requireMariConfig();
  const parsed = MariTimeLineCreateSchema.parse(input);
  const emp =
    normalizeMariEmployeeNumber(parsed.employeeNumber) ||
    normalizeMariEmployeeNumber(cfg.employeeNumber);
  if (!emp) throw new MariApiError("Personalnummer ungültig.", 400);

  const hoursBillable = Math.min(parsed.hoursBillable, parsed.hours);
  const body: Record<string, unknown> = {
    EmployeeNumber: emp,
    DayOfService: toDayIso(parsed.dayOfService),
    ProjectNumber: parsed.projectNumber,
    PhaseID: 0,
    Activity: parsed.activity,
    MemoText: parsed.memoText?.trim() || null,
    Hours: parsed.hours,
    HoursBillable: hoursBillable,
    ContractID: parsed.contractId,
    ContractPositionID: parsed.contractPositionId || 0,
    SourceReferenceType: parsed.issueId
      ? TIMEKEEPING_SOURCE_SUPPORT_ISSUE
      : 0,
    SourceReferenceID: parsed.issueId || 0,
  };

  const result = await mariJson<Record<string, unknown>>(
    "/api/TimeKeepingLine",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const lineId = Number(result.LineID) || 0;
  const feedback = Number(result.IMPORT_Feedback) || 0;
  const rawMsg = String(
    result.IMPORT_ErrorMessage || result.EXPORT_INFO || ""
  ).trim();
  // MARI liefert oft Feedback≠0 inkl. «successfully imported … Warnings:» — Buchung ist trotzdem da.
  const importedOk =
    lineId > 0 || /successfully\s+imported/i.test(rawMsg);
  if (!importedOk && feedback !== 0) {
    throw new MariApiError(
      rawMsg || "Zeitbuchung fehlgeschlagen",
      400,
      result
    );
  }

  const warningNote = (() => {
    if (!rawMsg) return null;
    const m = /warnings?\s*:\s*(.*)$/i.exec(rawMsg);
    const rest = (m?.[1] || "").trim();
    if (rest) return rest;
    if (/warning/i.test(rawMsg) && importedOk) return rawMsg;
    return null;
  })();

  if (lineId > 0) {
    try {
      const one = await mariJson<Record<string, unknown>>(
        `/api/TimeKeepingLine/${lineId}`
      );
      const hours = Number(one.Hours) || parsed.hours;
      const hb = Number(one.HoursBillable) || hoursBillable;
      return {
        lineId,
        serviceDate: String(one.DayOfService || parsed.dayOfService).slice(
          0,
          10
        ),
        employeeNumber: String(one.EmployeeNumber || emp),
        employeeName: null,
        projectNumber: String(one.ProjectNumber || parsed.projectNumber),
        phaseId: Number(one.PhaseID) || 0,
        activity: String(one.Activity || parsed.activity),
        memo: String(one.MemoText || "").trim() || null,
        hours,
        hoursBillable: hb,
        billable: hb > 0,
        contractId: Number(one.ContractID) || parsed.contractId,
        sourceType: Number(one.SourceReferenceType) || 0,
        sourceReference: Number(one.SourceReferenceID) || 0,
        timeStart: null,
        timeEnd: null,
        createDate: null,
        ...mapApprovalMode(
          one.ApprovalMode ?? one.ApprovalStatus ?? one.Freigabe
        ),
        warning: warningNote,
      };
    } catch {
      /* fall through */
    }
  }

  return {
    lineId,
    serviceDate: parsed.dayOfService,
    employeeNumber: emp,
    employeeName: null,
    projectNumber: parsed.projectNumber,
    phaseId: 0,
    activity: parsed.activity,
    memo: parsed.memoText?.trim() || null,
    hours: parsed.hours,
    hoursBillable,
    billable: hoursBillable > 0,
    contractId: parsed.contractId,
    sourceType: parsed.issueId ? TIMEKEEPING_SOURCE_SUPPORT_ISSUE : 0,
    sourceReference: parsed.issueId || 0,
    timeStart: null,
    timeEnd: null,
    createDate: null,
    ...mapApprovalMode(0),
    warning: warningNote,
  };
}

export async function getTimeKeepingLine(
  lineId: number
): Promise<Record<string, unknown>> {
  requireMariConfig();
  if (!Number.isInteger(lineId) || lineId <= 0) {
    throw new MariApiError("Buchungs-ID ungültig.", 400);
  }
  return mariJson<Record<string, unknown>>(`/api/TimeKeepingLine/${lineId}`);
}

async function assertLineEditable(lineId: number): Promise<void> {
  const rows = await mariSql<Record<string, unknown>>(
    `SELECT TOP 1 t."ApprovalMode"
FROM "MARIProjectTimeKeepingLines" t
WHERE t."TimeSheetEntryID" = ${lineId}`
  );
  const mode = rows[0]?.ApprovalMode;
  if (mode == null) return;
  if (mapApprovalMode(mode).approved) {
    throw new MariApiError(
      "Freigegebene Buchungen können nicht geändert oder gelöscht werden.",
      409
    );
  }
}

export async function deleteTimeKeepingLine(lineId: number): Promise<void> {
  requireMariConfig();
  if (!Number.isInteger(lineId) || lineId <= 0) {
    throw new MariApiError("Buchungs-ID ungültig.", 400);
  }
  await assertLineEditable(lineId);
  await mariJson<unknown>(`/api/TimeKeepingLine/${lineId}`, {
    method: "DELETE",
  });
}

/**
 * Ändern = löschen + neu anlegen (MARI hat kein PATCH für TimeKeepingLine).
 * Ticket-Verknüpfung wird aus der alten Zeile übernommen, falls nicht gesetzt.
 */
export async function replaceTimeKeepingLine(
  lineId: number,
  input: MariTimeLineCreateInput
): Promise<MariTimeLine> {
  await assertLineEditable(lineId);
  const existing = await getTimeKeepingLine(lineId);
  const srcType = Number(existing.SourceReferenceType) || 0;
  const srcId = Number(existing.SourceReferenceID) || 0;
  const issueId =
    input.issueId ||
    (srcType === TIMEKEEPING_SOURCE_SUPPORT_ISSUE && srcId > 0 ? srcId : null);

  await deleteTimeKeepingLine(lineId);
  try {
    return await createTimeKeepingLine({ ...input, issueId });
  } catch (err) {
    throw new MariApiError(
      `Alte Buchung #${lineId} wurde gelöscht, Neuanlage fehlgeschlagen: ${
        err instanceof Error ? err.message : String(err)
      }`,
      502,
      err
    );
  }
}
