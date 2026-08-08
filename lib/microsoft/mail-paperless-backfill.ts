import { graphJson } from "@/lib/microsoft/graph";
import { addDaysYmd, graphMailDateTimeUtc, zurichYmd } from "@/lib/microsoft/time";
import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  findDocumentForMicrosoftAttachment,
} from "@/lib/buddy/source-links";
import {
  listMicrosoftPdfAttachments,
} from "@/lib/microsoft/mail-attachments";
import { ingestMicrosoftMessagePdfs } from "@/lib/microsoft/mail-to-paperless";

export const O365_PDF_BACKFILL_ENABLED_KEY = "o365_pdf_backfill_enabled";
export const O365_PDF_BACKFILL_SINCE_KEY = "o365_pdf_backfill_since_ymd";
export const O365_PDF_BACKFILL_CURSOR_KEY = "o365_pdf_backfill_next_link";
export const O365_PDF_BACKFILL_LAST_RUN_KEY = "o365_pdf_backfill_last_run_at";
export const O365_PDF_BACKFILL_LAST_ERROR_KEY = "o365_pdf_backfill_last_error";
export const O365_PDF_BACKFILL_STATS_KEY = "o365_pdf_backfill_stats";

/**
 * Messages listed per run (Graph already filters hasAttachments).
 * Non-PDF attachment mails are skipped after a cheap metadata call — no download.
 */
export const O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN = 40;
/** Max PDFs uploaded per run. */
export const O365_PDF_BACKFILL_MAX_PDFS_PER_RUN = 12;

type GraphMessageLite = {
  id?: string;
  subject?: string | null;
  hasAttachments?: boolean;
  receivedDateTime?: string | null;
};

export type O365PdfBackfillStatus = {
  enabled: boolean;
  sinceYmd: string;
  hasCursor: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  stats: {
    messagesSeen: number;
    messagesWithPdf: number;
    pdfsUploaded: number;
    pdfsSkipped: number;
    pdfsFailed: number;
  };
  complete: boolean;
};

function defaultSinceYmd(yearsBack = 1): string {
  const today = zurichYmd();
  return addDaysYmd(today, -Math.round(yearsBack * 365));
}

function parseStats(raw: string | null): O365PdfBackfillStatus["stats"] {
  try {
    if (!raw) throw new Error("empty");
    const j = JSON.parse(raw) as Partial<O365PdfBackfillStatus["stats"]>;
    return {
      messagesSeen: Number(j.messagesSeen) || 0,
      messagesWithPdf: Number(j.messagesWithPdf) || 0,
      pdfsUploaded: Number(j.pdfsUploaded) || 0,
      pdfsSkipped: Number(j.pdfsSkipped) || 0,
      pdfsFailed: Number(j.pdfsFailed) || 0,
    };
  } catch {
    return {
      messagesSeen: 0,
      messagesWithPdf: 0,
      pdfsUploaded: 0,
      pdfsSkipped: 0,
      pdfsFailed: 0,
    };
  }
}

export function getO365PdfBackfillStatus(): O365PdfBackfillStatus {
  const since =
    getSetting(O365_PDF_BACKFILL_SINCE_KEY) || defaultSinceYmd(1);
  const cursor = getSetting(O365_PDF_BACKFILL_CURSOR_KEY);
  const enabled =
    getSetting(O365_PDF_BACKFILL_ENABLED_KEY) === "1" ||
    getSetting(O365_PDF_BACKFILL_ENABLED_KEY)?.toLowerCase() === "true";
  return {
    enabled,
    sinceYmd: since,
    hasCursor: Boolean(cursor),
    lastRunAt: getSetting(O365_PDF_BACKFILL_LAST_RUN_KEY),
    lastError: getSetting(O365_PDF_BACKFILL_LAST_ERROR_KEY),
    stats: parseStats(getSetting(O365_PDF_BACKFILL_STATS_KEY)),
    /** complete when enabled once and no cursor left after a run */
    complete:
      !enabled &&
      !cursor &&
      (parseStats(getSetting(O365_PDF_BACKFILL_STATS_KEY)).messagesSeen > 0 ||
        Boolean(getSetting(O365_PDF_BACKFILL_LAST_RUN_KEY))),
  };
}

export function configureO365PdfBackfill(input: {
  enabled?: boolean;
  /** YYYY-MM-DD — how far back (default ~1 year). Further back is OK. */
  sinceYmd?: string;
  resetStats?: boolean;
}): O365PdfBackfillStatus {
  if (input.enabled != null) {
    setSetting(O365_PDF_BACKFILL_ENABLED_KEY, input.enabled ? "1" : "0");
  }
  if (input.sinceYmd?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    setSetting(O365_PDF_BACKFILL_SINCE_KEY, input.sinceYmd);
    // Restart crawl from this date
    setSetting(O365_PDF_BACKFILL_CURSOR_KEY, null);
  }
  if (input.resetStats) {
    setSetting(O365_PDF_BACKFILL_STATS_KEY, null);
    setSetting(O365_PDF_BACKFILL_CURSOR_KEY, null);
    setSetting(O365_PDF_BACKFILL_LAST_ERROR_KEY, null);
  }
  return getO365PdfBackfillStatus();
}

/**
 * List inbox messages that Graph marks as having attachments since `sinceYmd`.
 * Graph cannot filter by «PDF only» on the message list — we then inspect
 * attachment metadata and skip non-PDFs without downloading.
 */
export async function listMicrosoftInboxWithAttachmentsPage(
  userId: number,
  options: {
    sinceYmd: string;
    nextLink?: string | null;
    pageSize?: number;
  }
): Promise<{
  messages: Array<{ id: string; subject: string; receivedDateTime: string | null }>;
  nextLink: string | null;
}> {
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 25));
  let data: {
    value?: GraphMessageLite[];
    "@odata.nextLink"?: string;
  };

  if (options.nextLink) {
    data = await graphJson(userId, options.nextLink);
  } else {
    const start = graphMailDateTimeUtc(options.sinceYmd);
    // DateTimeOffset must include Z / offset — bare local times → Graph 400
    const filter = `receivedDateTime ge ${start} and hasAttachments eq true`;
    const qs = new URLSearchParams({
      $filter: filter,
      $orderby: "receivedDateTime asc",
      $top: String(pageSize),
      $select: "id,subject,hasAttachments,receivedDateTime",
    });
    data = await graphJson(
      userId,
      `/me/mailFolders/inbox/messages?${qs}`
    );
  }

  const messages = (data.value || [])
    .filter((m) => m.id && m.hasAttachments !== false)
    .map((m) => ({
      id: m.id!,
      subject: (m.subject || "").trim() || "(kein Betreff)",
      receivedDateTime: m.receivedDateTime || null,
    }));

  return {
    messages,
    nextLink: data["@odata.nextLink"] || null,
  };
}

export type O365PdfBackfillRunResult = {
  messagesSeen: number;
  messagesWithPdf: number;
  pdfsUploaded: number;
  pdfsSkipped: number;
  pdfsFailed: number;
  done: boolean;
  nextLink: string | null;
};

/** One batch of the historical crawl (idempotent via source-links). */
export async function runO365PdfBackfillBatch(
  userId: number
): Promise<O365PdfBackfillRunResult> {
  const status = getO365PdfBackfillStatus();
  const sinceYmd = status.sinceYmd || defaultSinceYmd(1);
  const cursor = getSetting(O365_PDF_BACKFILL_CURSOR_KEY);

  const page = await listMicrosoftInboxWithAttachmentsPage(userId, {
    sinceYmd,
    nextLink: cursor,
    pageSize: O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
  });

  let pdfsUploaded = 0;
  let pdfsSkipped = 0;
  let pdfsFailed = 0;
  let messagesSeen = 0;
  let messagesWithPdf = 0;

  for (const msg of page.messages) {
    if (pdfsUploaded >= O365_PDF_BACKFILL_MAX_PDFS_PER_RUN) break;
    messagesSeen += 1;
    let pdfs;
    try {
      pdfs = await listMicrosoftPdfAttachments(userId, msg.id);
    } catch {
      continue;
    }
    if (pdfs.length === 0) continue;
    messagesWithPdf += 1;

    const pending = pdfs.filter(
      (p) => !findDocumentForMicrosoftAttachment(msg.id, p.id)
    );
    if (pending.length === 0) {
      pdfsSkipped += pdfs.length;
      continue;
    }

    const { results } = await ingestMicrosoftMessagePdfs({
      userId,
      messageId: msg.id,
    });
    for (const r of results) {
      if (r.ok && r.skipped === "already") pdfsSkipped += 1;
      else if (r.ok) pdfsUploaded += 1;
      else pdfsFailed += 1;
    }
    if (pdfsUploaded >= O365_PDF_BACKFILL_MAX_PDFS_PER_RUN) break;
  }

  setSetting(O365_PDF_BACKFILL_CURSOR_KEY, page.nextLink);
  const prev = parseStats(getSetting(O365_PDF_BACKFILL_STATS_KEY));
  const nextStats = {
    messagesSeen: prev.messagesSeen + messagesSeen,
    messagesWithPdf: prev.messagesWithPdf + messagesWithPdf,
    pdfsUploaded: prev.pdfsUploaded + pdfsUploaded,
    pdfsSkipped: prev.pdfsSkipped + pdfsSkipped,
    pdfsFailed: prev.pdfsFailed + pdfsFailed,
  };
  setSetting(O365_PDF_BACKFILL_STATS_KEY, JSON.stringify(nextStats));
  setSetting(O365_PDF_BACKFILL_LAST_RUN_KEY, new Date().toISOString());
  setSetting(O365_PDF_BACKFILL_LAST_ERROR_KEY, null);

  const done = !page.nextLink;
  if (done) {
    setSetting(O365_PDF_BACKFILL_ENABLED_KEY, "0");
  }

  return {
    messagesSeen,
    messagesWithPdf,
    pdfsUploaded,
    pdfsSkipped,
    pdfsFailed,
    done,
    nextLink: page.nextLink,
  };
}
