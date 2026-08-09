import {
  mariGetIssue,
  mariPatchIssue,
  mariSql,
  requireMariConfig,
  MariApiError,
} from "@/lib/mari/client";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  WORK_STATUS_IDS,
  statusChipLabel,
} from "@/lib/mari/status";

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

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
};

export type MariTimelineKind =
  | "inbound"
  | "reply"
  | "customer"
  | "system"
  | "note"
  | "change";

export type MariTimelineItem = {
  id: string;
  kind: MariTimelineKind;
  at: string;
  label: string;
  subject: string | null;
  text: string;
  actor: string | null;
  meta?: string | null;
};

export type MariTicketDetail = MariTicketListItem & {
  requestText: string;
  requestTextPlain: string;
  responsible: string | null;
  responsibleType: number | null;
  productId: number | null;
  parentType: number | null;
  timeline: MariTimelineItem[];
};

export type ListTicketsOptions = {
  statuses?: number[];
  overdueOnly?: boolean;
  limit?: number;
};

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
  const emp = sqlQuote(cfg.employeeNumber);
  const statusList = statuses.join(",");
  const overdueClause = options.overdueOnly
    ? ` AND i."DueDate" IS NOT NULL AND i."DueDate" < CURRENT_DATE `
    : "";

  const rows = await mariSql<{
    IssueID: number;
    StatusName: string | null;
    PriorityName: string | null;
    BriefDescription: string | null;
    CardCode: string | null;
    DueDate: string | null;
    Status: number;
    Priority: number;
    HandledBy: string | null;
    ChangeAtDate: string | null;
  }>(
    `SELECT TOP ${limit}
  i."IssueID",
  s."BEZEICHNUNG" AS "StatusName",
  p."BEZEICHNUNG" AS "PriorityName",
  i."BriefDescription",
  i."CardCode",
  i."DueDate",
  i."Status",
  i."Priority",
  i."HandledBy",
  i."ChangeAtDate"
FROM "MARISupportIssue" i
LEFT JOIN "MPHOTLINESETTINGS" s
  ON s."SETTING" = 1 AND s."ID" = i."Status"
LEFT JOIN "MPHOTLINESETTINGS" p
  ON p."SETTING" = 3 AND p."ID" = i."Priority"
WHERE i."HandledBy" = ${emp}
  AND i."EditorType" = 3
  AND i."Status" IN (${statusList})
  ${overdueClause}
ORDER BY
  CASE WHEN i."DueDate" IS NULL THEN 1 ELSE 0 END,
  i."DueDate",
  i."IssueID"`
  );

  return rows.map((r) => ({
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
  }));
}

async function loadTimeline(issueId: number): Promise<MariTimelineItem[]> {
  if (!Number.isInteger(issueId) || issueId <= 0) return [];

  const lines = await mariSql<{
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
  );

  const changes = await mariSql<{
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
  );

  const items: MariTimelineItem[] = [];

  for (const line of lines) {
    const plain = htmlToPlain(line.RequestText || "");
    // Skip near-empty mail stubs that only say "Aus E-Mail gesendet…" when a fuller sibling exists nearby — keep all for now but trim short stubs under 40 chars that match pattern
    if (
      plain.length < 40 &&
      /^Aus E-Mail gesendet/i.test(plain) &&
      !line.RequestPosSubject
    ) {
      continue;
    }
    const kind = lineKind(Number(line.RequestPosType));
    const actor =
      line.Originator ||
      line.HandledBy ||
      (kind === "inbound" || kind === "customer" ? null : null);
    items.push({
      id: `line-${line.RequestPosID}`,
      kind,
      at: line.CreateDate,
      label: lineLabel(Number(line.RequestPosType)),
      subject: line.RequestPosSubject || null,
      text: plain.slice(0, 4000),
      actor,
      meta:
        line.VisibleInternOnly === 1 ? "Nur intern sichtbar" : null,
    });
  }

  for (const ch of changes) {
    const field = ch.FieldName || ch.DBFieldName || "Feld";
    const from = (ch.FieldValue || "–").trim() || "–";
    const to = (ch.FieldValueNew || "–").trim() || "–";
    items.push({
      id: `chg-${ch.ChangeLogID}`,
      kind: "change",
      at: ch.ChangeDate,
      label: "Änderung",
      subject: null,
      text: `${field}: ${from} → ${to}`,
      actor: ch.HandledBy || null,
      meta: null,
    });
  }

  items.sort((a, b) => a.at.localeCompare(b.at));
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
  const requestText =
    typeof issue.RequestText === "string" ? issue.RequestText : "";
  const timeline = await loadTimeline(issueId);

  // Prefer status name from settings join when list not used
  let statusName = statusChipLabel(status, STATUS_LABELS[status]);
  let priorityName =
    PRIORITY_LABELS[priority] || `Prio ${priority}`;
  try {
    const names = await mariSql<{
      StatusName: string | null;
      PriorityName: string | null;
    }>(
      `SELECT
  s."BEZEICHNUNG" AS "StatusName",
  p."BEZEICHNUNG" AS "PriorityName"
FROM "MARISupportIssue" i
LEFT JOIN "MPHOTLINESETTINGS" s ON s."SETTING"=1 AND s."ID"=i."Status"
LEFT JOIN "MPHOTLINESETTINGS" p ON p."SETTING"=3 AND p."ID"=i."Priority"
WHERE i."IssueID"=${issueId}`
    );
    if (names[0]?.StatusName) statusName = statusChipLabel(status, names[0].StatusName);
    if (names[0]?.PriorityName) priorityName = names[0].PriorityName;
  } catch {
    /* ignore */
  }

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
      typeof issue.BusinessPartnerCode === "string"
        ? issue.BusinessPartnerCode
        : null,
    dueDate: typeof issue.DueDate === "string" ? issue.DueDate : null,
    handledBy:
      typeof issue.Responsible === "string" ? issue.Responsible : null,
    changeAtDate: null,
    requestText,
    requestTextPlain: htmlToPlain(requestText),
    responsible:
      typeof issue.Responsible === "string" ? issue.Responsible : null,
    responsibleType:
      typeof issue.ResponsibleType === "number"
        ? issue.ResponsibleType
        : Number(issue.ResponsibleType) || null,
    productId:
      typeof issue.ProductID === "number"
        ? issue.ProductID
        : Number(issue.ProductID) || null,
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
