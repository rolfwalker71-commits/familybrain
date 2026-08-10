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
};

export type MariDayTimeSummary = {
  date: string;
  lines: MariTimeLine[];
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
};

export type MariTimeLineCreateInput = {
  dayOfService: string;
  projectNumber: string;
  phaseId: number;
  activity: string;
  memoText?: string | null;
  hours: number;
  hoursBillable: number;
  contractId: number;
  contractPositionId?: number | null;
  issueId?: number | null;
  employeeNumber?: string | null;
};

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const MariTimeLineCreateSchema = z.object({
  dayOfService: Ymd,
  projectNumber: z.string().trim().min(1).max(40),
  phaseId: z.number().int().nonnegative(),
  activity: z.string().trim().min(1).max(100),
  memoText: z.string().trim().max(2000).nullable().optional(),
  hours: z.number().min(0.01).max(24),
  hoursBillable: z.number().min(0).max(24),
  contractId: z.number().int().nonnegative(),
  contractPositionId: z.number().int().nonnegative().nullable().optional(),
  issueId: z.number().int().positive().nullable().optional(),
  employeeNumber: z.string().trim().max(20).nullable().optional(),
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

function mapSqlLine(r: Record<string, unknown>): MariTimeLine {
  const hours = Number(r.Quantity) || 0;
  const hoursBillable = Number(r.InvQty) || 0;
  const serviceDateRaw = String(r.ServiceDate || "");
  const serviceDate = serviceDateRaw.slice(0, 10);
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
  };
}

function summarizeLines(
  date: string,
  lines: MariTimeLine[]
): MariDayTimeSummary {
  const totalHours = roundHours(lines.reduce((s, l) => s + l.hours, 0));
  const billableHours = roundHours(
    lines.reduce((s, l) => s + l.hoursBillable, 0)
  );
  return {
    date,
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
  employeeNumber?: string | null;
}): Promise<MariDayTimeSummary> {
  const cfg = requireMariConfig();
  const emp =
    normalizeMariEmployeeNumber(input.employeeNumber) ||
    normalizeMariEmployeeNumber(cfg.employeeNumber);
  if (!emp) throw new MariApiError("Personalnummer ungültig.", 400);
  const ymd = Ymd.parse(input.dateYmd);
  const empQ = emp.replace(/'/g, "''");
  const rows = await mariSql<Record<string, unknown>>(
    `SELECT TOP 200
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
  t."CreateDate"
FROM "MARIProjectTimeKeepingLines" t
LEFT JOIN "MARIEmployeeMaster" e
  ON e."EmployeeNumber" = t."EmployeeNumber"
WHERE t."EmployeeNumber" = '${empQ}'
  AND t."ServiceDate" >= '${ymd}'
  AND t."ServiceDate" < '${ymd}T23:59:59.999'
ORDER BY t."TimeSheetEntryID"`
  );
  const lines = rows
    .map(mapSqlLine)
    .filter((l) => l.serviceDate === ymd && l.lineId > 0);
  return summarizeLines(ymd, lines);
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
  t."CreateDate"
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
    PhaseID: parsed.phaseId,
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

  const feedback = Number(result.IMPORT_Feedback) || 0;
  if (feedback !== 0) {
    throw new MariApiError(
      String(result.IMPORT_ErrorMessage || "Zeitbuchung fehlgeschlagen"),
      400,
      result
    );
  }

  const lineId = Number(result.LineID) || 0;
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
        phaseId: Number(one.PhaseID) || parsed.phaseId,
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
    phaseId: parsed.phaseId,
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
  };
}
