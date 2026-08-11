import { z } from "zod";
import {
  MariApiError,
  mariFetch,
  mariJson,
  mariSql,
  requireMariConfig,
} from "@/lib/mari/client";
import { normalizeMariEmployeeNumber } from "@/lib/mari/tickets";
import {
  addDaysYmd,
  approvalStatusLabel,
  formatPeriodLabel,
  mapApprovalMode,
  resolveTimePeriodRange,
  TIMEKEEPING_SOURCE_SUPPORT_ISSUE,
  type MariApprovalStatus,
  type MariDayTimeSummary,
  type MariKeyPair,
  type MariTimeLine,
  type MariTimePeriod,
} from "@/lib/mari/timekeeping-shared";
import {
  buildTimekeepingUserDefinedFieldValues,
  mergeTimekeepingUdfIntoMemo,
  parseTimekeepingUdfFromMemo,
  stripTimekeepingUdfFromMemo,
  type TimekeepingUdfFields,
} from "@/lib/mari/timekeeping-udfs";

export {
  addDaysYmd,
  approvalStatusLabel,
  formatPeriodLabel,
  mapApprovalMode,
  resolveTimePeriodRange,
  TIMEKEEPING_SOURCE_SUPPORT_ISSUE,
  type MariApprovalStatus,
  type MariDayTimeSummary,
  type MariKeyPair,
  type MariTimeLine,
  type MariTimePeriod,
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
  /** Optional; wenn leer, wird automatisch eine Projektphase gewählt (UI ohne Phase). */
  phaseId?: number | null;
  /** USER_ND_Int_Bemerkung_Verr */
  internalRemarkVerr?: string | null;
  /** USER_Begruendung */
  zeroHoursReason?: string | null;
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
  internalRemarkVerr: z.string().trim().max(40).nullable().optional(),
  zeroHoursReason: z.string().trim().max(500).nullable().optional(),
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
  t."ApprovalMode",
  t."USER_ND_Int_Bemerkung_Verr" AS "InternalRemarkVerr",
  t."USER_Begruendung" AS "ZeroHoursReason",
  i."AddressMatchcode" AS "AddressMatchcode"
`;

async function enrichTimeLinesProjectCustomer(
  lines: MariTimeLine[]
): Promise<MariTimeLine[]> {
  if (lines.length === 0) return lines;
  const byPn = new Map<string, string>();
  try {
    const projects = await listProjectsForTimeBooking();
    for (const p of projects) {
      const label = p.matchcode.trim();
      if (!label) continue;
      // Projekt-Matchcode hat Vorrang — nie Ticket-AddressMatchcode für die PN cachen.
      for (const key of [p.keyVisible, p.keyInternal]) {
        const k = String(key || "").trim();
        if (k) byPn.set(k, label);
      }
    }
  } catch {
    /* Projektliste optional */
  }
  return lines.map((l) => {
    const fromProject = byPn.get(l.projectNumber.trim());
    return {
      ...l,
      projectCustomer: fromProject || l.projectCustomer,
    };
  });
}

function mapSqlLine(r: Record<string, unknown>): MariTimeLine {
  const hours = Number(r.Quantity) || 0;
  const hoursBillable = Number(r.InvQty) || 0;
  const serviceDateRaw = String(r.ServiceDate || "");
  const serviceDate = serviceDateRaw.slice(0, 10);
  const approval = mapApprovalMode(r.ApprovalMode);
  const memoRaw = String(r.Memo || "").trim() || null;
  const fromSql: TimekeepingUdfFields = {
    internalRemarkVerr:
      String(r.InternalRemarkVerr || "").trim() || null,
    zeroHoursReason: String(r.ZeroHoursReason || "").trim() || null,
  };
  const fromMemo = parseTimekeepingUdfFromMemo(memoRaw);
  const sourceType = Number(r.SourceType) || 0;
  const addressFromTicket =
    sourceType === TIMEKEEPING_SOURCE_SUPPORT_ISSUE
      ? String(r.AddressMatchcode || "").trim() || null
      : null;
  return {
    lineId: Number(r.TimeSheetEntryID) || 0,
    serviceDate,
    employeeNumber: String(r.EmployeeNumber || ""),
    employeeName:
      String(r.EmployeeName || r.EmployeeMatchcode || "").trim() || null,
    projectNumber: String(r.ProjectNumber || ""),
    projectCustomer:
      String(r.ProjectCustomer || "").trim() || addressFromTicket,
    phaseId: Number(r.PhaseID) || 0,
    activity: String(r.ActivityText || "").trim(),
    memo: stripTimekeepingUdfFromMemo(memoRaw) || null,
    internalRemarkVerr: fromSql.internalRemarkVerr || fromMemo.internalRemarkVerr,
    zeroHoursReason: fromSql.zeroHoursReason || fromMemo.zeroHoursReason,
    hours,
    hoursBillable,
    billable: hoursBillable > 0,
    contractId: Number(r.ContractID) || 0,
    sourceType,
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

/**
 * UI hat kein Phasenfeld — MARI verlangt trotzdem eine Phase.
 * Weglassen / PhaseID 0 schlägt fehl; PhaseID oder PhaseIDByName funktionieren.
 */
async function resolvePhaseForBooking(
  projectNumber: string
): Promise<{ phaseId: number; phaseName: string }> {
  const phases = await listPhasesForTimeBooking(projectNumber);
  if (phases.length === 0) {
    throw new MariApiError(
      `Keine Phase für Projekt ${projectNumber} in MARI gefunden.`,
      400
    );
  }
  const preferred =
    phases.find((p) => /meeting|besprechung|abstimmung/i.test(p.matchcode)) ||
    phases[0];
  const phaseId = Number(preferred.keyInternal) || 0;
  const phaseName = preferred.matchcode.trim();
  if (phaseId <= 0 && !phaseName) {
    throw new MariApiError(
      `Ungültige Phase für Projekt ${projectNumber}.`,
      400
    );
  }
  return { phaseId, phaseName };
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
LEFT JOIN "MARISupportIssue" i
  ON i."IssueID" = t."SourceReference"
  AND t."SourceType" = ${TIMEKEEPING_SOURCE_SUPPORT_ISSUE}
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
  return summarizeLines(
    ymd,
    period,
    fromDate,
    toDate,
    await enrichTimeLinesProjectCustomer(lines)
  );
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
LEFT JOIN "MARISupportIssue" i
  ON i."IssueID" = t."SourceReference"
  AND t."SourceType" = ${TIMEKEEPING_SOURCE_SUPPORT_ISSUE}
WHERE t."SourceReference" = ${issueId}
  AND t."SourceType" = ${TIMEKEEPING_SOURCE_SUPPORT_ISSUE}
ORDER BY t."ServiceDate" DESC, t."TimeSheetEntryID" DESC`
  );
  return enrichTimeLinesProjectCustomer(
    rows.map(mapSqlLine).filter((l) => l.lineId > 0)
  );
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
  const resolved =
    parsed.phaseId != null && parsed.phaseId > 0
      ? { phaseId: parsed.phaseId, phaseName: "" }
      : await resolvePhaseForBooking(parsed.projectNumber);
  const udf: TimekeepingUdfFields = {
    internalRemarkVerr: parsed.internalRemarkVerr?.trim() || null,
    zeroHoursReason: parsed.zeroHoursReason?.trim() || null,
  };
  const memoForMari = mergeTimekeepingUdfIntoMemo(
    parsed.memoText?.trim() || null,
    udf
  );
  const body: Record<string, unknown> = {
    EmployeeNumber: emp,
    DayOfService: toDayIso(parsed.dayOfService),
    ProjectNumber: parsed.projectNumber,
    Activity: parsed.activity,
    MemoText: memoForMari,
    Hours: parsed.hours,
    HoursBillable: hoursBillable,
    ContractID: parsed.contractId,
    ContractPositionID: parsed.contractPositionId || 0,
    SourceReferenceType: parsed.issueId
      ? TIMEKEEPING_SOURCE_SUPPORT_ISSUE
      : 0,
    SourceReferenceID: parsed.issueId || 0,
  };
  const udfPayload = buildTimekeepingUserDefinedFieldValues(udf);
  if (udfPayload) {
    body.UserDefinedFieldValues = udfPayload;
  }
  // Nie PhaseID 0 allein senden — MARI meldet dann «Phase fehlt».
  if (resolved.phaseId > 0) {
    body.PhaseID = resolved.phaseId;
  }
  if (resolved.phaseName) {
    body.PhaseIDByName = resolved.phaseName;
  }
  if (!body.PhaseID && !body.PhaseIDByName) {
    throw new MariApiError(
      `Keine Phase für Projekt ${parsed.projectNumber} auflösbar.`,
      400
    );
  }

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
      const memoRaw = String(one.MemoText || memoForMari || "").trim() || null;
      const fromMemo = parseTimekeepingUdfFromMemo(memoRaw);
      return {
        lineId,
        serviceDate: String(one.DayOfService || parsed.dayOfService).slice(
          0,
          10
        ),
        employeeNumber: String(one.EmployeeNumber || emp),
        employeeName: null,
        projectNumber: String(one.ProjectNumber || parsed.projectNumber),
        projectCustomer: null,
        phaseId: Number(one.PhaseID) || resolved.phaseId,
        activity: String(one.Activity || parsed.activity),
        memo: stripTimekeepingUdfFromMemo(memoRaw) || null,
        internalRemarkVerr:
          udf.internalRemarkVerr || fromMemo.internalRemarkVerr,
        zeroHoursReason: udf.zeroHoursReason || fromMemo.zeroHoursReason,
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
    projectCustomer: null,
    phaseId: resolved.phaseId,
    activity: parsed.activity,
    memo: stripTimekeepingUdfFromMemo(memoForMari) || null,
    internalRemarkVerr: udf.internalRemarkVerr,
    zeroHoursReason: udf.zeroHoursReason,
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

/** Zeile inkl. USER-Feldern aus der MARI-View (REST liefert UDFs oft nicht). */
export async function getTimeKeepingLineDetail(
  lineId: number
): Promise<MariTimeLine | null> {
  requireMariConfig();
  if (!Number.isInteger(lineId) || lineId <= 0) {
    throw new MariApiError("Buchungs-ID ungültig.", 400);
  }
  const rows = await mariSql<Record<string, unknown>>(
    `SELECT TOP 1
${TIME_LINE_SQL_SELECT}
FROM "MARIProjectTimeKeepingLines" t
LEFT JOIN "MARIEmployeeMaster" e
  ON e."EmployeeNumber" = t."EmployeeNumber"
LEFT JOIN "MARISupportIssue" i
  ON i."IssueID" = t."SourceReference"
  AND t."SourceType" = ${TIMEKEEPING_SOURCE_SUPPORT_ISSUE}
WHERE t."TimeSheetEntryID" = ${lineId}`
  );
  const line = rows[0] ? mapSqlLine(rows[0]) : null;
  if (!line || line.lineId <= 0) return null;
  const [enriched] = await enrichTimeLinesProjectCustomer([line]);
  return enriched || line;
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
  // Erfolg: oft HTTP 200 mit leerem Body (kein JSON).
  const res = await mariFetch(`/api/TimeKeepingLine/${lineId}`, {
    method: "DELETE",
  });
  const text = (await res.text()).trim();
  if (res.ok) return;
  let detail = "";
  if (text) {
    try {
      const parsed = JSON.parse(text) as { Message?: string };
      detail = String(parsed.Message || "").trim();
    } catch {
      detail = text.slice(0, 300);
    }
  }
  if (!detail || /^an error has occurred\.?$/i.test(detail)) {
    detail =
      "Löschen in MARI fehlgeschlagen. Mögliche Ursachen: Buchungsperiode gesperrt, freigegeben, interne Weiterbelastung oder bereits verrechnet.";
  }
  throw new MariApiError(detail, res.status || 502, text || null);
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
