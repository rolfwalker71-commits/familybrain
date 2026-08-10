import {
  mariGetIssue,
  mariPatchIssue,
  mariSql,
  requireMariConfig,
  MariApiError,
} from "@/lib/mari/client";
import {
  isMariImageMime,
  listMariAttachments,
  type MariAttachmentMeta,
} from "@/lib/mari/attachments";
import {
  resolveTimelineSide,
  isMariMailStubText,
  type MariTimelineKind,
  type MariTimelineSide,
} from "@/lib/mari/timeline-side";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  WORK_STATUS_IDS,
  statusChipLabel,
} from "@/lib/mari/status";

export type { MariTimelineKind, MariTimelineSide } from "@/lib/mari/timeline-side";
export {
  resolveTimelineSide,
  timelineSideLabel,
  isMariMailStubText,
} from "@/lib/mari/timeline-side";

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Maringo «Support»-Klasse in MPHOTLINECLASSTYPE.
 * Andere Klassen (z.B. 676 Projektaufgaben) haben eigene Status-/UI-Welten
 * und dürfen nicht in «Meine Support-Tickets» landen.
 */
export const SUPPORT_HOTLINE_CLASS_TYPE = 17;

function htmlToPlain(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type MariTicketListItem = {
  issueId: number;
  briefDescription: string;
  status: number;
  statusName: string;
  priority: number;
  priorityName: string;
  cardCode: string | null;
  dueDate: string | null;
  handledBy: string | null;
  changeAtDate: string | null;
  /** IssueType Bezeichnung (Supportanfrage, Auftrag, …) */
  issueType: number | null;
  issueTypeName: string | null;
  /** Produktname (Applikation, Technik, …) */
  productId: number | null;
  productName: string | null;
  /** Firmen-Matchcode */
  addressMatchcode: string | null;
  referenceText: string | null;
  handledByName: string | null;
  supportGroupId: number | null;
  supportGroupName: string | null;
  requestDate: string | null;
  contactPerson: string | null;
  /** USER_U_Std_Freigegeben_Kunde */
  stdFreigabe: string | null;
  /** AI-Kurzinfo (Topic/Category) */
  aiLabel: string | null;
};

export type MariTimelineAttachment = {
  attachmentId: number;
  orgFilename: string;
  mimeType: string;
  isImage: boolean;
};

export type MariTimelineItem = {
  id: string;
  kind: MariTimelineKind;
  /** Support (wir) / Kunde / System — für UI und AI-Kontext */
  side: MariTimelineSide;
  at: string;
  label: string;
  subject: string | null;
  text: string;
  actor: string | null;
  meta?: string | null;
  attachments?: MariTimelineAttachment[];
};

export type MariTicketDetail = MariTicketListItem & {
  requestText: string;
  requestTextPlain: string;
  responsible: string | null;
  responsibleType: number | null;
  parentType: number | null;
  timeline: MariTimelineItem[];
};

export type ListTicketsOptions = {
  statuses?: number[];
  overdueOnly?: boolean;
  limit?: number;
  /** Override HandledBy (EmployeeNumber, z.B. M2055). Default: konfigurierte Personalnummer. */
  employeeNumber?: string | null;
};

export type MariEmployeeOption = {
  employeeNumber: string;
  matchcode: string;
  employeeName: string | null;
  nameInitials: string | null;
};

/** Personalnummer wie in MARI (z.B. M1010). */
export function normalizeMariEmployeeNumber(
  raw: string | null | undefined
): string | null {
  const v = (raw || "").trim().toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9]{2,20}$/.test(v)) return null;
  return v;
}

export async function listMariEmployees(): Promise<MariEmployeeOption[]> {
  requireMariConfig();
  const rows = await mariSql<{
    EmployeeNumber: string;
    Matchcode: string | null;
    EmployeeName: string | null;
    NameInitials: string | null;
  }>(
    `SELECT TOP 300
  e."EmployeeNumber",
  e."Matchcode",
  e."EmployeeName",
  e."NameInitials"
FROM "MARIEmployeeMaster" e
WHERE (e."Inactive" = 0 OR e."Inactive" IS NULL)
  AND e."EmployeeNumber" LIKE 'M%'
ORDER BY e."Matchcode", e."EmployeeNumber"`
  );
  return rows
    .map((r) => {
      const employeeNumber = normalizeMariEmployeeNumber(r.EmployeeNumber);
      if (!employeeNumber) return null;
      return {
        employeeNumber,
        matchcode: (r.Matchcode || "").trim() || employeeNumber,
        employeeName: (r.EmployeeName || "").trim() || null,
        nameInitials: (r.NameInitials || "").trim() || null,
      };
    })
    .filter((x): x is MariEmployeeOption => x != null);
}

function lineKind(posType: number): MariTimelineKind {
  switch (posType) {
    case 1:
      return "reply";
    case 3:
      return "inbound";
    case 4:
      return "system";
    case 5:
      return "note";
    case 8:
      return "customer";
    default:
      return "note";
  }
}

function lineLabel(posType: number): string {
  switch (posType) {
    case 1:
      return "Antwort";
    case 3:
      return "Eingang";
    case 4:
      return "System";
    case 5:
      return "Notiz";
    case 8:
      return "Kunde";
    default:
      return `Typ ${posType}`;
  }
}

export async function listMyTickets(
  options: ListTicketsOptions = {}
): Promise<MariTicketListItem[]> {
  const cfg = requireMariConfig();
  const statuses =
    options.statuses && options.statuses.length > 0
      ? options.statuses.filter((n) => Number.isInteger(n) && n > 0)
      : [...WORK_STATUS_IDS];
  if (statuses.length === 0) return [];
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const empRaw =
    normalizeMariEmployeeNumber(options.employeeNumber) ||
    normalizeMariEmployeeNumber(cfg.employeeNumber);
  if (!empRaw) {
    throw new MariApiError(
      "Personalnummer fehlt oder ungültig (z.B. M1010).",
      400
    );
  }
  const emp = sqlQuote(empRaw);
  const statusList = statuses.join(",");
  const overdueClause = options.overdueOnly
    ? ` AND i."DueDate" IS NOT NULL AND i."DueDate" < CURRENT_DATE `
    : "";

  const rows = await mariSql<{
    IssueID: number;
    StatusName: string | null;
    PriorityName: string | null;
    IssueTypeName: string | null;
    ProductName: string | null;
    BriefDescription: string | null;
    AddressMatchcode: string | null;
    ReferenceText: string | null;
    CardCode: string | null;
    DueDate: string | null;
    RequestDate: string | null;
    ChangeAtDate: string | null;
    Status: number;
    Priority: number;
    IssueType: number | null;
    ProductID: number | null;
    HandledBy: string | null;
    HandledByName: string | null;
    SupportGroupID: number | null;
    SupportGroupName: string | null;
    ContactPerson: string | null;
    StdFreigabe: string | null;
    AiTopic: string | null;
    AiCategory: string | null;
  }>(
    `SELECT TOP ${limit}
  i."IssueID",
  s."BEZEICHNUNG" AS "StatusName",
  p."BEZEICHNUNG" AS "PriorityName",
  t."BEZEICHNUNG" AS "IssueTypeName",
  pr."ProductName" AS "ProductName",
  i."BriefDescription",
  i."AddressMatchcode",
  i."ReferenceText",
  i."CardCode",
  i."DueDate",
  i."RequestDate",
  i."ChangeAtDate",
  i."Status",
  i."Priority",
  i."IssueType",
  i."ProductID",
  i."HandledBy",
  e."Matchcode" AS "HandledByName",
  i."SupportGroupID",
  g."Description" AS "SupportGroupName",
  i."ContactPerson",
  i."USER_U_Std_Freigegeben_Kunde" AS "StdFreigabe",
  i."USER_ANG_AI_TOPIC" AS "AiTopic",
  i."USER_ANG_AI_CATEGORY" AS "AiCategory"
FROM "MARISupportIssue" i
LEFT JOIN "MPHOTLINESETTINGS" s
  ON s."SETTING" = 1 AND s."ID" = i."Status"
LEFT JOIN "MPHOTLINESETTINGS" p
  ON p."SETTING" = 3 AND p."ID" = i."Priority"
LEFT JOIN "MPHOTLINESETTINGS" t
  ON t."SETTING" = 2 AND t."ID" = i."IssueType"
LEFT JOIN "MARISupportProduct" pr
  ON pr."ProductID" = i."ProductID"
LEFT JOIN "MARIEmployeeMaster" e
  ON e."EmployeeNumber" = i."HandledBy"
LEFT JOIN "MARISupportGroup" g
  ON g."GroupId" = i."SupportGroupID"
WHERE i."HandledBy" = ${emp}
  AND i."EditorType" = 3
  AND i."HotlineClassType" = ${SUPPORT_HOTLINE_CLASS_TYPE}
  AND i."Status" IN (${statusList})
  ${overdueClause}
ORDER BY
  CASE WHEN i."DueDate" IS NULL THEN 1 ELSE 0 END,
  i."DueDate",
  i."IssueID"`
  );

  return rows.map((r) => {
    const ai =
      (r.AiTopic || "").trim() ||
      (r.AiCategory || "").trim() ||
      null;
    return {
      issueId: Number(r.IssueID),
      briefDescription: r.BriefDescription || "(ohne Betreff)",
      status: Number(r.Status),
      statusName: statusChipLabel(
        Number(r.Status),
        r.StatusName || undefined
      ),
      priority: Number(r.Priority),
      priorityName:
        r.PriorityName ||
        PRIORITY_LABELS[Number(r.Priority)] ||
        `Prio ${r.Priority}`,
      cardCode: r.CardCode || null,
      dueDate: r.DueDate || null,
      handledBy: r.HandledBy || null,
      changeAtDate: r.ChangeAtDate || null,
      issueType: r.IssueType == null ? null : Number(r.IssueType),
      issueTypeName: r.IssueTypeName || null,
      productId: r.ProductID == null ? null : Number(r.ProductID),
      productName: r.ProductName || null,
      addressMatchcode: r.AddressMatchcode || null,
      referenceText: (r.ReferenceText || "").trim() || null,
      handledByName: r.HandledByName || null,
      supportGroupId:
        r.SupportGroupID == null ? null : Number(r.SupportGroupID),
      supportGroupName: r.SupportGroupName || null,
      requestDate: r.RequestDate || null,
      contactPerson: (r.ContactPerson || "").trim() || null,
      stdFreigabe:
        r.StdFreigabe == null || String(r.StdFreigabe).trim() === ""
          ? null
          : String(r.StdFreigabe).trim(),
      aiLabel: ai,
    };
  });
}

function toTimelineAttachment(
  meta: MariAttachmentMeta
): MariTimelineAttachment {
  return {
    attachmentId: meta.attachmentId,
    orgFilename: meta.orgFilename,
    mimeType: meta.mimeType,
    isImage: isMariImageMime(meta.mimeType, meta.orgFilename),
  };
}

/** Mail-Platzhalter ohne echten Inhalt — oft nur Träger für Anhänge. */
function isMailAttachmentStub(plain: string, _subject: string | null): boolean {
  return isMariMailStubText(plain);
}

async function loadTimeline(issueId: number): Promise<MariTimelineItem[]> {
  if (!Number.isInteger(issueId) || issueId <= 0) return [];

  const [lines, changes, attachmentMetas] = await Promise.all([
    mariSql<{
      RequestPosID: number;
      RequestPosType: number;
      RequestPosSubject: string | null;
      RequestText: string | null;
      Originator: string | null;
      HandledBy: string | null;
      CreateDate: string;
      VisibleInternOnly: number | null;
    }>(
      `SELECT TOP 200
  "RequestPosID",
  "RequestPosType",
  "RequestPosSubject",
  "RequestText",
  "Originator",
  "HandledBy",
  "CreateDate",
  "VisibleInternOnly"
FROM "MARISupportIssueLine"
WHERE "IssueID" = ${issueId}
ORDER BY "CreateDate", "RequestPosID"`
    ),
    mariSql<{
      ChangeLogID: number;
      FieldName: string | null;
      FieldValue: string | null;
      FieldValueNew: string | null;
      HandledBy: string | null;
      ChangeDate: string;
      DBFieldName: string | null;
    }>(
      `SELECT TOP 100
  "ChangeLogID",
  "FieldName",
  "FieldValue",
  "FieldValueNew",
  "HandledBy",
  "ChangeDate",
  "DBFieldName"
FROM "MARISupportIssueChangeLog"
WHERE "IssueID" = ${issueId}
  AND "DBFieldName" IN ('Status','FaelligAm','Priority','Editor','EditorType','HandledBy')
ORDER BY "ChangeDate", "ChangeLogID"`
    ),
    listMariAttachments(issueId).catch(() => [] as MariAttachmentMeta[]),
  ]);

  const fileByPosId = new Map<number, MariAttachmentMeta>();
  for (const a of attachmentMetas) {
    if (a.hasFile) fileByPosId.set(a.attachmentId, a);
  }

  const items: MariTimelineItem[] = [];
  type PendingGroup = {
    ids: number[];
    at: string;
    posType: number;
    actor: string | null;
    meta: string | null;
    stubText: string;
    attachments: MariTimelineAttachment[];
  };
  let pending: PendingGroup | null = null;

  const flushPending = () => {
    if (!pending || pending.attachments.length === 0) {
      pending = null;
      return;
    }
    const n = pending.attachments.length;
    const side = resolveTimelineSide({
      kind: "attachment",
      posType: pending.posType,
      actor: pending.actor,
      internalOnly: Boolean(pending.meta),
    });
    items.push({
      id: `att-${pending.ids[0]}${n > 1 ? `-${n}` : ""}`,
      kind: "attachment",
      side,
      at: pending.at,
      label: n === 1 ? "Anhang" : `${n} Anhänge`,
      subject: null,
      text: pending.stubText.slice(0, 4000),
      actor: pending.actor,
      meta: pending.meta,
      attachments: pending.attachments,
    });
    pending = null;
  };

  for (const line of lines) {
    const plain = htmlToPlain(line.RequestText || "");
    const subject = line.RequestPosSubject || null;
    const file = fileByPosId.get(Number(line.RequestPosID));
    const stub = isMailAttachmentStub(plain, subject);
    const internMeta =
      line.VisibleInternOnly != null && Number(line.VisibleInternOnly) !== 0
        ? "Nur intern sichtbar"
        : null;
    const actor = line.Originator || line.HandledBy || null;

    // Dateianhang: in Gruppe mergen wenn Mail-Stub, sonst an Text-Zeile hängen
    if (file && stub) {
      const att = toTimelineAttachment(file);
      if (
        pending &&
        pending.stubText === plain.trim() &&
        pending.posType === Number(line.RequestPosType)
      ) {
        pending.ids.push(Number(line.RequestPosID));
        pending.attachments.push(att);
        if (!pending.meta && internMeta) pending.meta = internMeta;
        if (!pending.actor && actor) pending.actor = actor;
      } else {
        flushPending();
        pending = {
          ids: [Number(line.RequestPosID)],
          at: line.CreateDate,
          posType: Number(line.RequestPosType),
          actor,
          meta: internMeta,
          stubText: plain.trim(),
          attachments: [att],
        };
      }
      continue;
    }

    flushPending();

    if (stub && !file) {
      // kurzer Mail-Stub ohne Datei → ausblenden
      if (plain.length < 40 || /^Aus E-Mail gesendet/i.test(plain)) {
        continue;
      }
    }

    const kind = lineKind(Number(line.RequestPosType));
    const side = resolveTimelineSide({
      kind,
      posType: Number(line.RequestPosType),
      actor,
      internalOnly: Boolean(internMeta),
    });
    items.push({
      id: `line-${line.RequestPosID}`,
      kind,
      side,
      at: line.CreateDate,
      label: lineLabel(Number(line.RequestPosType)),
      subject,
      text: plain.slice(0, 4000),
      actor,
      meta: internMeta,
      attachments: file ? [toTimelineAttachment(file)] : undefined,
    });
  }
  flushPending();

  for (const ch of changes) {
    const field = ch.FieldName || ch.DBFieldName || "Feld";
    const from = (ch.FieldValue || "–").trim() || "–";
    const to = (ch.FieldValueNew || "–").trim() || "–";
    items.push({
      id: `chg-${ch.ChangeLogID}`,
      kind: "change",
      side: "system",
      at: ch.ChangeDate,
      label: "Änderung",
      subject: null,
      text: `${field}: ${from} → ${to}`,
      actor: ch.HandledBy || null,
      meta: null,
    });
  }

  items.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return items;
}

export async function getTicketDetail(
  issueId: number
): Promise<MariTicketDetail> {
  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new MariApiError("Ungültige Ticket-ID", 400);
  }
  const issue = await mariGetIssue(issueId);
  const status = Number(issue.Status);
  const priority = Number(issue.Priority);
  let requestText =
    typeof issue.RequestText === "string" ? issue.RequestText : "";
  // REST liefert RequestText manchmal leer/anders — SQL als Fallback.
  if (!htmlToPlain(requestText)) {
    try {
      const rows = await mariSql<{ RequestText: string | null }>(
        `SELECT "RequestText" FROM "MARISupportIssue" WHERE "IssueID" = ${issueId}`
      );
      const sqlText = rows[0]?.RequestText;
      if (typeof sqlText === "string" && htmlToPlain(sqlText)) {
        requestText = sqlText;
      }
    } catch {
      /* ignore */
    }
  }
  const timeline = await loadTimeline(issueId);

  // Prefer labels from settings / master joins
  let statusName = statusChipLabel(status, STATUS_LABELS[status]);
  let priorityName = PRIORITY_LABELS[priority] || `Prio ${priority}`;
  let issueTypeName: string | null = null;
  let productName: string | null = null;
  let addressMatchcode: string | null = null;
  let referenceText: string | null = null;
  let handledByName: string | null = null;
  let supportGroupName: string | null = null;
  let requestDate: string | null = null;
  let changeAtDate: string | null = null;
  let contactPerson: string | null = null;
  let stdFreigabe: string | null = null;
  let aiLabel: string | null = null;
  let issueType: number | null = null;
  let supportGroupId: number | null = null;
  let productIdFromView: number | null = null;
  let cardCodeFromView: string | null = null;
  let handledByFromView: string | null = null;
  let dueDateFromView: string | null = null;

  try {
    const names = await mariSql<{
      StatusName: string | null;
      PriorityName: string | null;
      IssueTypeName: string | null;
      ProductName: string | null;
      AddressMatchcode: string | null;
      ReferenceText: string | null;
      HandledByName: string | null;
      SupportGroupName: string | null;
      RequestDate: string | null;
      ChangeAtDate: string | null;
      ContactPerson: string | null;
      StdFreigabe: string | null;
      AiTopic: string | null;
      AiCategory: string | null;
      IssueType: number | null;
      SupportGroupID: number | null;
      ProductID: number | null;
      CardCode: string | null;
      HandledBy: string | null;
      DueDate: string | null;
    }>(
      `SELECT
  s."BEZEICHNUNG" AS "StatusName",
  p."BEZEICHNUNG" AS "PriorityName",
  t."BEZEICHNUNG" AS "IssueTypeName",
  pr."ProductName" AS "ProductName",
  i."AddressMatchcode",
  i."ReferenceText",
  e."Matchcode" AS "HandledByName",
  g."Description" AS "SupportGroupName",
  i."RequestDate",
  i."ChangeAtDate",
  i."ContactPerson",
  i."USER_U_Std_Freigegeben_Kunde" AS "StdFreigabe",
  i."USER_ANG_AI_TOPIC" AS "AiTopic",
  i."USER_ANG_AI_CATEGORY" AS "AiCategory",
  i."IssueType",
  i."SupportGroupID",
  i."ProductID",
  i."CardCode",
  i."HandledBy",
  i."DueDate"
FROM "MARISupportIssue" i
LEFT JOIN "MPHOTLINESETTINGS" s ON s."SETTING"=1 AND s."ID"=i."Status"
LEFT JOIN "MPHOTLINESETTINGS" p ON p."SETTING"=3 AND p."ID"=i."Priority"
LEFT JOIN "MPHOTLINESETTINGS" t ON t."SETTING"=2 AND t."ID"=i."IssueType"
LEFT JOIN "MARISupportProduct" pr ON pr."ProductID"=i."ProductID"
LEFT JOIN "MARIEmployeeMaster" e ON e."EmployeeNumber"=i."HandledBy"
LEFT JOIN "MARISupportGroup" g ON g."GroupId"=i."SupportGroupID"
WHERE i."IssueID"=${issueId}`
    );
    const n = names[0];
    if (n?.StatusName) statusName = statusChipLabel(status, n.StatusName);
    if (n?.PriorityName) priorityName = n.PriorityName;
    issueTypeName = n?.IssueTypeName || null;
    productName = n?.ProductName || null;
    addressMatchcode = n?.AddressMatchcode || null;
    referenceText = (n?.ReferenceText || "").trim() || null;
    handledByName = n?.HandledByName || null;
    supportGroupName = n?.SupportGroupName || null;
    requestDate = n?.RequestDate || null;
    changeAtDate = n?.ChangeAtDate || null;
    contactPerson = (n?.ContactPerson || "").trim() || null;
    stdFreigabe =
      n?.StdFreigabe == null || String(n.StdFreigabe).trim() === ""
        ? null
        : String(n.StdFreigabe).trim();
    aiLabel =
      (n?.AiTopic || "").trim() || (n?.AiCategory || "").trim() || null;
    issueType = n?.IssueType != null ? Number(n.IssueType) : null;
    supportGroupId =
      n?.SupportGroupID != null ? Number(n.SupportGroupID) : null;
    productIdFromView = n?.ProductID != null ? Number(n.ProductID) : null;
    cardCodeFromView = n?.CardCode || null;
    handledByFromView = n?.HandledBy || null;
    dueDateFromView = n?.DueDate || null;
  } catch {
    /* ignore */
  }

  const productId =
    productIdFromView ??
    (typeof issue.ProductID === "number"
      ? issue.ProductID
      : Number(issue.ProductID) || null);

  return {
    issueId,
    briefDescription:
      (typeof issue.BriefDescription === "string" && issue.BriefDescription) ||
      "(ohne Betreff)",
    status,
    statusName,
    priority,
    priorityName,
    cardCode:
      cardCodeFromView ||
      (typeof issue.BusinessPartnerCode === "string"
        ? issue.BusinessPartnerCode
        : null),
    dueDate:
      dueDateFromView ||
      (typeof issue.DueDate === "string" ? issue.DueDate : null),
    handledBy:
      handledByFromView ||
      (typeof issue.Responsible === "string" ? issue.Responsible : null),
    changeAtDate,
    issueType,
    issueTypeName,
    productId,
    productName,
    addressMatchcode,
    referenceText,
    handledByName,
    supportGroupId,
    supportGroupName,
    requestDate,
    contactPerson,
    stdFreigabe,
    aiLabel,
    requestText,
    requestTextPlain: htmlToPlain(requestText),
    responsible:
      typeof issue.Responsible === "string" ? issue.Responsible : null,
    responsibleType:
      typeof issue.ResponsibleType === "number"
        ? issue.ResponsibleType
        : Number(issue.ResponsibleType) || null,
    parentType:
      typeof issue.ParentType === "number"
        ? issue.ParentType
        : Number(issue.ParentType) || null,
    timeline,
  };
}

export async function patchTicketFields(
  issueId: number,
  patch: {
    status?: number;
    dueDate?: string | null;
    priority?: number;
  }
): Promise<MariTicketDetail> {
  const current = await mariGetIssue(issueId);
  const productId =
    typeof current.ProductID === "number"
      ? current.ProductID
      : Number(current.ProductID) || 0;
  const parentType =
    typeof current.ParentType === "number"
      ? current.ParentType
      : Number(current.ParentType);

  const body: Record<string, unknown> = {};
  if (patch.status !== undefined) body.Status = patch.status;
  if (patch.priority !== undefined) body.Priority = patch.priority;
  if (patch.dueDate !== undefined) {
    if (patch.dueDate === null || patch.dueDate === "") {
      body.DueDate = null;
    } else {
      // Accept YYYY-MM-DD or full ISO
      const d = patch.dueDate.includes("T")
        ? patch.dueDate
        : `${patch.dueDate}T00:00:00`;
      body.DueDate = d;
    }
  }

  if (Object.keys(body).length === 0) {
    throw new MariApiError("Keine Änderungen angegeben.", 400);
  }

  // Problem tickets often need ProductID / ParentType
  if (!productId || productId === 0) {
    body.ProductID = 100001;
  } else {
    body.ProductID = productId;
  }
  if (parentType === -1 || Number.isNaN(parentType)) {
    body.ParentType = 0;
  }

  const result = await mariPatchIssue(issueId, body);
  if (result.IMPORT_Feedback && result.IMPORT_Feedback !== 0) {
    throw new MariApiError(
      result.IMPORT_ErrorMessage || "MARI PATCH fehlgeschlagen",
      400,
      result
    );
  }
  return getTicketDetail(issueId);
}

export { htmlToPlain };
