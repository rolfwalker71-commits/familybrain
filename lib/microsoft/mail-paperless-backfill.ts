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
export const O365_PDF_BACKFILL_LAST_NOTE_KEY = "o365_pdf_backfill_last_note";
export const O365_PDF_BACKFILL_LAST_ATTEMPT_KEY = "o365_pdf_backfill_last_attempt_at";
export const O365_PDF_BACKFILL_STATS_KEY = "o365_pdf_backfill_stats";
export const O365_PDF_BACKFILL_PROGRESS_KEY = "o365_pdf_backfill_progress";

/**
 * Catch-up crawl: several Graph pages per job, then auto-chain (see job runner).
 * Non-PDF attachment mails are skipped after a cheap metadata call — no download.
 */
/** Messages per Graph page ($top, Graph-seitig max. sinnvoll ~50). */
export const O365_PDF_BACKFILL_PAGE_SIZE = 50;
/** Max Graph-Seiten pro Job-Lauf. */
export const O365_PDF_BACKFILL_MAX_PAGES_PER_RUN = 8;
/** Hartes Mail-Limit über alle Seiten eines Laufs. */
export const O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN =
  O365_PDF_BACKFILL_PAGE_SIZE * O365_PDF_BACKFILL_MAX_PAGES_PER_RUN;
/** Max neue PDFs pro Job-Lauf (Upload nach Paperless). */
export const O365_PDF_BACKFILL_MAX_PDFS_PER_RUN = 40;

type GraphMessageLite = {
  id?: string;
  subject?: string | null;
  hasAttachments?: boolean;
  receivedDateTime?: string | null;
};

export type O365PdfBackfillLiveProgress = {
  active: boolean;
  step:
    | "starting"
    | "fetch_page"
    | "scan_mail"
    | "upload_pdf"
    | "finishing"
    | "idle";
  subject: string | null;
  receivedDateTime: string | null;
  /** 1-based index in current Graph page */
  messageIndex: number;
  messageTotal: number;
  pdfsUploadedThisBatch: number;
  pdfsMaxThisBatch: number;
  detail: string | null;
  updatedAt: string;
};

export type O365PdfBackfillStatus = {
  enabled: boolean;
  sinceYmd: string;
  hasCursor: boolean;
  lastRunAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastNote: string | null;
  stats: {
    messagesSeen: number;
    messagesWithPdf: number;
    pdfsUploaded: number;
    pdfsSkipped: number;
    pdfsFailed: number;
  };
  complete: boolean;
  /** Human phase for the UI */
  phase:
    | "idle"
    | "queued"
    | "running_or_waiting"
    | "error"
    | "complete";
  live: O365PdfBackfillLiveProgress | null;
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

function derivePhase(input: {
  enabled: boolean;
  hasCursor: boolean;
  lastError: string | null;
  complete: boolean;
}): O365PdfBackfillStatus["phase"] {
  if (input.lastError) return "error";
  if (input.complete) return "complete";
  if (input.enabled || input.hasCursor) return "running_or_waiting";
  return "idle";
}

export function setO365PdfBackfillNote(note: string | null): void {
  setSetting(O365_PDF_BACKFILL_LAST_NOTE_KEY, note);
}

export function setO365PdfBackfillAttemptNow(): void {
  setSetting(O365_PDF_BACKFILL_LAST_ATTEMPT_KEY, new Date().toISOString());
}

function writeLiveProgress(
  partial: Partial<O365PdfBackfillLiveProgress> & {
    step: O365PdfBackfillLiveProgress["step"];
    active: boolean;
  }
): void {
  const prev = parseLiveProgress(getSetting(O365_PDF_BACKFILL_PROGRESS_KEY));
  const next: O365PdfBackfillLiveProgress = {
    active: partial.active,
    step: partial.step,
    subject: partial.subject !== undefined ? partial.subject : prev?.subject ?? null,
    receivedDateTime:
      partial.receivedDateTime !== undefined
        ? partial.receivedDateTime
        : prev?.receivedDateTime ?? null,
    messageIndex: partial.messageIndex ?? prev?.messageIndex ?? 0,
    messageTotal: partial.messageTotal ?? prev?.messageTotal ?? 0,
    pdfsUploadedThisBatch:
      partial.pdfsUploadedThisBatch ?? prev?.pdfsUploadedThisBatch ?? 0,
    pdfsMaxThisBatch:
      partial.pdfsMaxThisBatch ??
      prev?.pdfsMaxThisBatch ??
      O365_PDF_BACKFILL_MAX_PDFS_PER_RUN,
    detail: partial.detail !== undefined ? partial.detail : prev?.detail ?? null,
    updatedAt: new Date().toISOString(),
  };
  setSetting(O365_PDF_BACKFILL_PROGRESS_KEY, JSON.stringify(next));
}

function clearLiveProgress(): void {
  setSetting(O365_PDF_BACKFILL_PROGRESS_KEY, null);
}

function parseLiveProgress(
  raw: string | null
): O365PdfBackfillLiveProgress | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<O365PdfBackfillLiveProgress>;
    return {
      active: Boolean(j.active),
      step: (j.step as O365PdfBackfillLiveProgress["step"]) || "idle",
      subject: j.subject ?? null,
      receivedDateTime: j.receivedDateTime ?? null,
      messageIndex: Number(j.messageIndex) || 0,
      messageTotal: Number(j.messageTotal) || 0,
      pdfsUploadedThisBatch: Number(j.pdfsUploadedThisBatch) || 0,
      pdfsMaxThisBatch:
        Number(j.pdfsMaxThisBatch) || O365_PDF_BACKFILL_MAX_PDFS_PER_RUN,
      detail: j.detail ?? null,
      updatedAt: j.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function getO365PdfBackfillStatus(): O365PdfBackfillStatus {
  const since =
    getSetting(O365_PDF_BACKFILL_SINCE_KEY) || defaultSinceYmd(1);
  const cursor = getSetting(O365_PDF_BACKFILL_CURSOR_KEY);
  const enabled =
    getSetting(O365_PDF_BACKFILL_ENABLED_KEY) === "1" ||
    getSetting(O365_PDF_BACKFILL_ENABLED_KEY)?.toLowerCase() === "true";
  const lastError = getSetting(O365_PDF_BACKFILL_LAST_ERROR_KEY);
  const stats = parseStats(getSetting(O365_PDF_BACKFILL_STATS_KEY));
  const lastRunAt = getSetting(O365_PDF_BACKFILL_LAST_RUN_KEY);
  const complete =
    !enabled &&
    !cursor &&
    (stats.messagesSeen > 0 || Boolean(lastRunAt));
  return {
    enabled,
    sinceYmd: since,
    hasCursor: Boolean(cursor),
    lastRunAt,
    lastAttemptAt: getSetting(O365_PDF_BACKFILL_LAST_ATTEMPT_KEY),
    lastError,
    lastNote: getSetting(O365_PDF_BACKFILL_LAST_NOTE_KEY),
    stats,
    complete,
    phase: derivePhase({
      enabled,
      hasCursor: Boolean(cursor),
      lastError,
      complete,
    }),
    live: parseLiveProgress(getSetting(O365_PDF_BACKFILL_PROGRESS_KEY)),
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
    setSetting(O365_PDF_BACKFILL_LAST_NOTE_KEY, null);
    setSetting(O365_PDF_BACKFILL_LAST_RUN_KEY, null);
    setSetting(O365_PDF_BACKFILL_LAST_ATTEMPT_KEY, null);
    clearLiveProgress();
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
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
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

/** One catch-up run: several Graph pages (idempotent via source-links). */
export async function runO365PdfBackfillBatch(
  userId: number
): Promise<O365PdfBackfillRunResult> {
  setO365PdfBackfillAttemptNow();
  const status = getO365PdfBackfillStatus();
  const sinceYmd = status.sinceYmd || defaultSinceYmd(1);
  let cursor = getSetting(O365_PDF_BACKFILL_CURSOR_KEY);

  writeLiveProgress({
    active: true,
    step: "fetch_page",
    subject: null,
    receivedDateTime: null,
    messageIndex: 0,
    messageTotal: 0,
    pdfsUploadedThisBatch: 0,
    pdfsMaxThisBatch: O365_PDF_BACKFILL_MAX_PDFS_PER_RUN,
    detail: cursor
      ? "Lade nächste Graph-Seite…"
      : `Lade Inbox ab ${sinceYmd}…`,
  });

  let pdfsUploaded = 0;
  let pdfsSkipped = 0;
  let pdfsFailed = 0;
  let messagesSeen = 0;
  let messagesWithPdf = 0;
  let pagesDone = 0;
  let lastNextLink: string | null = cursor;
  let done = false;
  let stoppedMidPage = false;

  while (
    pagesDone < O365_PDF_BACKFILL_MAX_PAGES_PER_RUN &&
    messagesSeen < O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN &&
    pdfsUploaded < O365_PDF_BACKFILL_MAX_PDFS_PER_RUN
  ) {
    writeLiveProgress({
      active: true,
      step: "fetch_page",
      messageIndex: messagesSeen,
      messageTotal: Math.max(messagesSeen, O365_PDF_BACKFILL_PAGE_SIZE),
      pdfsUploadedThisBatch: pdfsUploaded,
      detail:
        pagesDone === 0
          ? cursor
            ? "Lade nächste Graph-Seite…"
            : `Lade Inbox ab ${sinceYmd}…`
          : `Seite ${pagesDone + 1}/${O365_PDF_BACKFILL_MAX_PAGES_PER_RUN}…`,
    });

    const page = await listMicrosoftInboxWithAttachmentsPage(userId, {
      sinceYmd,
      nextLink: cursor,
      pageSize: O365_PDF_BACKFILL_PAGE_SIZE,
    });
    pagesDone += 1;
    lastNextLink = page.nextLink;
    const pageTotal = page.messages.length;
    let pageComplete = true;

    if (pageTotal === 0) {
      done = !page.nextLink;
      cursor = page.nextLink;
      setSetting(O365_PDF_BACKFILL_CURSOR_KEY, cursor);
      break;
    }

    for (const msg of page.messages) {
      if (
        pdfsUploaded >= O365_PDF_BACKFILL_MAX_PDFS_PER_RUN ||
        messagesSeen >= O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN
      ) {
        pageComplete = false;
        stoppedMidPage = true;
        break;
      }
      messagesSeen += 1;
      writeLiveProgress({
        active: true,
        step: "scan_mail",
        subject: msg.subject,
        receivedDateTime: msg.receivedDateTime,
        messageIndex: messagesSeen,
        messageTotal: O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
        pdfsUploadedThisBatch: pdfsUploaded,
        detail: `Seite ${pagesDone} · Prüfe Anhänge…`,
      });

      let pdfs;
      try {
        pdfs = await listMicrosoftPdfAttachments(userId, msg.id);
      } catch {
        writeLiveProgress({
          active: true,
          step: "scan_mail",
          subject: msg.subject,
          receivedDateTime: msg.receivedDateTime,
          messageIndex: messagesSeen,
          messageTotal: O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
          pdfsUploadedThisBatch: pdfsUploaded,
          detail: "Anhänge konnten nicht gelesen werden — übersprungen",
        });
        continue;
      }
      if (pdfs.length === 0) {
        writeLiveProgress({
          active: true,
          step: "scan_mail",
          subject: msg.subject,
          receivedDateTime: msg.receivedDateTime,
          messageIndex: messagesSeen,
          messageTotal: O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
          pdfsUploadedThisBatch: pdfsUploaded,
          detail: "Kein PDF — übersprungen",
        });
        continue;
      }
      messagesWithPdf += 1;

      const pending = pdfs.filter(
        (p) => !findDocumentForMicrosoftAttachment(msg.id, p.id)
      );
      if (pending.length === 0) {
        pdfsSkipped += pdfs.length;
        writeLiveProgress({
          active: true,
          step: "scan_mail",
          subject: msg.subject,
          receivedDateTime: msg.receivedDateTime,
          messageIndex: messagesSeen,
          messageTotal: O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
          pdfsUploadedThisBatch: pdfsUploaded,
          detail: `${pdfs.length} PDF(s) bereits in Buddy`,
        });
        continue;
      }

      writeLiveProgress({
        active: true,
        step: "upload_pdf",
        subject: msg.subject,
        receivedDateTime: msg.receivedDateTime,
        messageIndex: messagesSeen,
        messageTotal: O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
        pdfsUploadedThisBatch: pdfsUploaded,
        detail: `Lade ${pending.length} PDF(s) nach Paperless…`,
      });

      const { results } = await ingestMicrosoftMessagePdfs({
        userId,
        messageId: msg.id,
      });
      for (const r of results) {
        if (r.ok && r.skipped === "already") pdfsSkipped += 1;
        else if (r.ok) pdfsUploaded += 1;
        else pdfsFailed += 1;
      }
      writeLiveProgress({
        active: true,
        step: "upload_pdf",
        subject: msg.subject,
        receivedDateTime: msg.receivedDateTime,
        messageIndex: messagesSeen,
        messageTotal: O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
        pdfsUploadedThisBatch: pdfsUploaded,
        detail: `PDFs · neu ${pdfsUploaded}/${O365_PDF_BACKFILL_MAX_PDFS_PER_RUN} · Seite ${pagesDone}`,
      });
    }

    if (pageComplete) {
      cursor = page.nextLink;
      setSetting(O365_PDF_BACKFILL_CURSOR_KEY, cursor);
      if (!page.nextLink) {
        done = true;
        break;
      }
    } else {
      // Cursor bleibt — Seite beim nächsten Lauf erneut (bereits importierte PDFs = skip).
      break;
    }
  }

  writeLiveProgress({
    active: true,
    step: "finishing",
    messageIndex: messagesSeen,
    messageTotal: messagesSeen,
    pdfsUploadedThisBatch: pdfsUploaded,
    detail: "Batch speichern…",
  });

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

  if (done) {
    setSetting(O365_PDF_BACKFILL_ENABLED_KEY, "0");
  }

  const note = done
    ? `Crawl fertig · ${pdfsUploaded} neu, ${messagesSeen} Mails · ${pagesDone} Seite(n)`
    : `Catch-up · ${pdfsUploaded} neu / ${pdfsSkipped} übersprungen / ${messagesSeen} Mails · ${pagesDone} Seite(n)${
        stoppedMidPage ? " · Seite fortsetzen" : ""
      } · Fortsetzung folgt gleich`;
  setO365PdfBackfillNote(note);
  clearLiveProgress();

  return {
    messagesSeen,
    messagesWithPdf,
    pdfsUploaded,
    pdfsSkipped,
    pdfsFailed,
    done,
    nextLink: done ? null : lastNextLink,
  };
}
