import { graphJson } from "@/lib/microsoft/graph";
import { addDaysYmd, graphMailDateTimeUtc, zurichYmd } from "@/lib/microsoft/time";
import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  findDocumentForMicrosoftAttachment,
} from "@/lib/buddy/source-links";
import {
  listMicrosoftPdfAttachments,
  type MicrosoftMailAttachmentMeta,
} from "@/lib/microsoft/mail-attachments";
import {
  ingestMicrosoftMessagePdfs,
  resolveO365TagIdsCached,
} from "@/lib/microsoft/mail-to-paperless";
import { cancelActiveJobRun } from "@/lib/jobs/queries";

export const O365_PDF_BACKFILL_ENABLED_KEY = "o365_pdf_backfill_enabled";
export const O365_PDF_BACKFILL_SINCE_KEY = "o365_pdf_backfill_since_ymd";
export const O365_PDF_BACKFILL_CURSOR_KEY = "o365_pdf_backfill_next_link";
export const O365_PDF_BACKFILL_LAST_RUN_KEY = "o365_pdf_backfill_last_run_at";
export const O365_PDF_BACKFILL_LAST_ERROR_KEY = "o365_pdf_backfill_last_error";
export const O365_PDF_BACKFILL_LAST_NOTE_KEY = "o365_pdf_backfill_last_note";
export const O365_PDF_BACKFILL_LAST_ATTEMPT_KEY = "o365_pdf_backfill_last_attempt_at";
export const O365_PDF_BACKFILL_STATS_KEY = "o365_pdf_backfill_stats";
export const O365_PDF_BACKFILL_PROGRESS_KEY = "o365_pdf_backfill_progress";
/** Farthest mail received-date (YYYY-MM-DD) seen in this crawl. */
export const O365_PDF_BACKFILL_REACHED_YMD_KEY = "o365_pdf_backfill_reached_ymd";
/** Ring buffer of recent mail outcomes (JSON array). */
export const O365_PDF_BACKFILL_LOG_KEY = "o365_pdf_backfill_log_json";

export const O365_PDF_BACKFILL_LOG_MAX = 200;

const chainGlobal = globalThis as unknown as {
  __o365PdfBackfillChainTimer?: ReturnType<typeof setTimeout> | null;
};

export type O365PdfBackfillLogOutcome =
  | "uploaded"
  | "skipped_already"
  | "skipped_no_pdf"
  | "attachment_error"
  | "upload_error"
  | "stopped";

export type O365PdfBackfillLogEntry = {
  at: string;
  receivedAt: string | null;
  /** YYYY-MM-DD from receivedAt (Zurich-ish date part of ISO). */
  receivedYmd: string | null;
  subject: string;
  outcome: O365PdfBackfillLogOutcome;
  pdfNew?: number;
  pdfFailed?: number;
  detail?: string | null;
};

/**
 * Catch-up crawl: several Graph pages per job, then auto-chain (see job runner).
 * Non-PDF attachment mails are skipped after a cheap metadata call — no download.
 */
/** Messages per Graph page ($top, Graph-seitig max. sinnvoll ~50). */
export const O365_PDF_BACKFILL_PAGE_SIZE = 50;
/** Max Graph-Seiten pro Job-Lauf (50×16 = 800 Mails). */
export const O365_PDF_BACKFILL_MAX_PAGES_PER_RUN = 16;
/** Hartes Mail-Limit über alle Seiten eines Laufs. */
export const O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN =
  O365_PDF_BACKFILL_PAGE_SIZE * O365_PDF_BACKFILL_MAX_PAGES_PER_RUN;
/** Max neue PDFs pro Job-Lauf (Upload nach Paperless). */
export const O365_PDF_BACKFILL_MAX_PDFS_PER_RUN = 80;
/** Parallel Graph attachment-list calls while scanning a page. */
export const O365_PDF_BACKFILL_SCAN_CONCURRENCY = 12;
/** Parallel PDF uploads within one mail. */
export const O365_PDF_BACKFILL_UPLOAD_CONCURRENCY = 2;
/** Delay between successful catch-up blocks. */
export const O365_PDF_BACKFILL_CHAIN_DELAY_MS = 400;
/** Retry when global job lease is busy. */
export const O365_PDF_BACKFILL_CHAIN_RETRY_MS = 4_000;
/** Paperless consume poll interval during catch-up. */
export const O365_PDF_BACKFILL_PAPERLESS_POLL_MS = 400;
/** Cap wait per PDF (Stop bricht kooperativ ab; API-v10-ID-Erkennung ist schneller). */
export const O365_PDF_BACKFILL_PAPERLESS_TIMEOUT_MS = 90_000;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const idx = next;
      next += 1;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

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
  /** Live batch counters (UI while stats JSON still shows last finished run). */
  messagesWithPdfThisBatch?: number;
  pdfsSkippedThisBatch?: number;
  pdfsFailedThisBatch?: number;
  detail: string | null;
  updatedAt: string;
};

export type O365PdfBackfillStatus = {
  enabled: boolean;
  sinceYmd: string;
  hasCursor: boolean;
  /** Furthest mail date reached (asc crawl). */
  reachedYmd: string | null;
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
  /** Newest-first ring buffer for UI. */
  log: O365PdfBackfillLogEntry[];
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

export function isO365PdfBackfillEnabled(): boolean {
  const v = getSetting(O365_PDF_BACKFILL_ENABLED_KEY);
  return v === "1" || v?.toLowerCase() === "true";
}

export function clearO365PdfBackfillChainTimer(): void {
  if (chainGlobal.__o365PdfBackfillChainTimer) {
    clearTimeout(chainGlobal.__o365PdfBackfillChainTimer);
    chainGlobal.__o365PdfBackfillChainTimer = null;
  }
}

/** Schedule next catch-up block; cleared by stop. */
export function scheduleO365PdfBackfillChain(
  fn: () => void,
  delayMs = O365_PDF_BACKFILL_CHAIN_DELAY_MS
): void {
  clearO365PdfBackfillChainTimer();
  chainGlobal.__o365PdfBackfillChainTimer = setTimeout(() => {
    chainGlobal.__o365PdfBackfillChainTimer = null;
    fn();
  }, delayMs);
}

function ymdFromReceivedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim());
  return m?.[1] || null;
}

function bumpReachedYmd(receivedAt: string | null | undefined): void {
  const ymd = ymdFromReceivedAt(receivedAt);
  if (!ymd) return;
  const prev = getSetting(O365_PDF_BACKFILL_REACHED_YMD_KEY);
  if (!prev || ymd > prev) {
    setSetting(O365_PDF_BACKFILL_REACHED_YMD_KEY, ymd);
  }
}

function readLog(): O365PdfBackfillLogEntry[] {
  const raw = getSetting(O365_PDF_BACKFILL_LOG_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as O365PdfBackfillLogEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function appendO365PdfBackfillLog(
  entry: Omit<O365PdfBackfillLogEntry, "at" | "receivedYmd"> & {
    at?: string;
  }
): void {
  const receivedYmd = ymdFromReceivedAt(entry.receivedAt);
  bumpReachedYmd(entry.receivedAt);
  const next: O365PdfBackfillLogEntry = {
    at: entry.at || new Date().toISOString(),
    receivedAt: entry.receivedAt,
    receivedYmd,
    subject: entry.subject.slice(0, 180),
    outcome: entry.outcome,
    pdfNew: entry.pdfNew,
    pdfFailed: entry.pdfFailed,
    detail: entry.detail?.slice(0, 240) || null,
  };
  const log = [next, ...readLog()].slice(0, O365_PDF_BACKFILL_LOG_MAX);
  setSetting(O365_PDF_BACKFILL_LOG_KEY, JSON.stringify(log));
}

/** Soft-stop: no more chain, current loop exits ASAP, cursor kept. */
export function stopO365PdfBackfill(reason = "Manuell gestoppt"): O365PdfBackfillStatus {
  clearO365PdfBackfillChainTimer();
  setSetting(O365_PDF_BACKFILL_ENABLED_KEY, "0");
  setO365PdfBackfillNote(reason);
  // Mark live UI idle immediately (uploads may still wind down cooperatively)
  writeLiveProgress({
    active: false,
    step: "idle",
    detail: reason,
  });
  appendO365PdfBackfillLog({
    receivedAt: getSetting(O365_PDF_BACKFILL_REACHED_YMD_KEY)
      ? `${getSetting(O365_PDF_BACKFILL_REACHED_YMD_KEY)}T12:00:00Z`
      : null,
    subject: "— Stop —",
    outcome: "stopped",
    detail: reason,
  });
  try {
    cancelActiveJobRun("O365 Catch-up gestoppt");
  } catch {
    /* ignore if no active lease */
  }
  return getO365PdfBackfillStatus();
}

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
    messagesWithPdfThisBatch:
      partial.messagesWithPdfThisBatch ?? prev?.messagesWithPdfThisBatch ?? 0,
    pdfsSkippedThisBatch:
      partial.pdfsSkippedThisBatch ?? prev?.pdfsSkippedThisBatch ?? 0,
    pdfsFailedThisBatch:
      partial.pdfsFailedThisBatch ?? prev?.pdfsFailedThisBatch ?? 0,
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
      messagesWithPdfThisBatch: Number(j.messagesWithPdfThisBatch) || 0,
      pdfsSkippedThisBatch: Number(j.pdfsSkippedThisBatch) || 0,
      pdfsFailedThisBatch: Number(j.pdfsFailedThisBatch) || 0,
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
  const enabled = isO365PdfBackfillEnabled();
  const lastError = getSetting(O365_PDF_BACKFILL_LAST_ERROR_KEY);
  const stats = parseStats(getSetting(O365_PDF_BACKFILL_STATS_KEY));
  const lastRunAt = getSetting(O365_PDF_BACKFILL_LAST_RUN_KEY);
  const live = parseLiveProgress(getSetting(O365_PDF_BACKFILL_PROGRESS_KEY));
  const reachedStored = getSetting(O365_PDF_BACKFILL_REACHED_YMD_KEY);
  const reachedLive = ymdFromReceivedAt(live?.receivedDateTime);
  const reachedYmd =
    reachedStored && reachedLive
      ? reachedStored > reachedLive
        ? reachedStored
        : reachedLive
      : reachedStored || reachedLive;
  // Heal: if live is ahead of stored watermark, persist it
  if (reachedLive && (!reachedStored || reachedLive > reachedStored)) {
    setSetting(O365_PDF_BACKFILL_REACHED_YMD_KEY, reachedLive);
  }
  const complete =
    !enabled &&
    !cursor &&
    (stats.messagesSeen > 0 || Boolean(lastRunAt));
  return {
    enabled,
    sinceYmd: since,
    hasCursor: Boolean(cursor),
    reachedYmd,
    lastRunAt,
    lastAttemptAt: getSetting(O365_PDF_BACKFILL_LAST_ATTEMPT_KEY),
    lastError,
    lastNote: getSetting(O365_PDF_BACKFILL_LAST_NOTE_KEY),
    stats,
    log: readLog(),
    complete,
    phase: derivePhase({
      enabled,
      hasCursor: Boolean(cursor),
      lastError,
      complete,
    }),
    live,
  };
}

export function configureO365PdfBackfill(input: {
  enabled?: boolean;
  /**
   * YYYY-MM-DD — only when intentionally changing the window.
   * Resets Graph-Cursor (crawl starts again from this date).
   */
  sinceYmd?: string;
  /** Also clear cursor/stats/log (use with sinceYmd for a clean restart). */
  resetStats?: boolean;
  /** Soft-stop: disable + cancel chain (alias for stop). */
  stop?: boolean;
}): O365PdfBackfillStatus {
  if (input.stop) {
    return stopO365PdfBackfill("Manuell gestoppt — Cursor bleibt. «Weiter» setzt fort.");
  }
  if (input.enabled === false) {
    return stopO365PdfBackfill("Pausiert — Cursor bleibt. «Weiter» setzt fort.");
  }
  if (input.enabled === true) {
    setSetting(O365_PDF_BACKFILL_ENABLED_KEY, "1");
  }
  if (input.sinceYmd?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    setSetting(O365_PDF_BACKFILL_SINCE_KEY, input.sinceYmd);
    // Restart crawl from this date (Graph pagination cursor is date-window specific)
    setSetting(O365_PDF_BACKFILL_CURSOR_KEY, null);
  }
  if (input.resetStats) {
    setSetting(O365_PDF_BACKFILL_STATS_KEY, null);
    setSetting(O365_PDF_BACKFILL_CURSOR_KEY, null);
    setSetting(O365_PDF_BACKFILL_LAST_ERROR_KEY, null);
    setSetting(O365_PDF_BACKFILL_LAST_NOTE_KEY, null);
    setSetting(O365_PDF_BACKFILL_LAST_RUN_KEY, null);
    setSetting(O365_PDF_BACKFILL_LAST_ATTEMPT_KEY, null);
    setSetting(O365_PDF_BACKFILL_REACHED_YMD_KEY, null);
    setSetting(O365_PDF_BACKFILL_LOG_KEY, null);
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
  /** Soft-stop requested mid-run */
  stopped: boolean;
  nextLink: string | null;
  reachedYmd: string | null;
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
    messagesWithPdfThisBatch: 0,
    pdfsSkippedThisBatch: 0,
    pdfsFailedThisBatch: 0,
    detail: cursor
      ? "Lade nächste Graph-Seite…"
      : `Lade Inbox ab ${sinceYmd} (älteste → neueste)…`,
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
  let stopped = false;

  // Tag-IDs einmal pro Batch — nicht pro PDF
  const tagIds = await resolveO365TagIdsCached();

  while (
    pagesDone < O365_PDF_BACKFILL_MAX_PAGES_PER_RUN &&
    messagesSeen < O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN &&
    pdfsUploaded < O365_PDF_BACKFILL_MAX_PDFS_PER_RUN
  ) {
    if (!isO365PdfBackfillEnabled()) {
      stopped = true;
      stoppedMidPage = true;
      break;
    }

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
            : `Lade Inbox ab ${sinceYmd} (älteste → neueste)…`
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

    writeLiveProgress({
      active: true,
      step: "scan_mail",
      messageIndex: messagesSeen,
      messageTotal: O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
      pdfsUploadedThisBatch: pdfsUploaded,
      detail: `Seite ${pagesDone}: Anhänge parallel prüfen (${pageTotal} Mails)…`,
    });

    type Scanned = {
      msg: (typeof page.messages)[number];
      pdfs: MicrosoftMailAttachmentMeta[] | null;
      listError: boolean;
    };

    const scanned = await mapPool(
      page.messages,
      O365_PDF_BACKFILL_SCAN_CONCURRENCY,
      async (msg): Promise<Scanned> => {
        if (!isO365PdfBackfillEnabled()) {
          return { msg, pdfs: null, listError: false };
        }
        try {
          const pdfs = await listMicrosoftPdfAttachments(userId, msg.id);
          return { msg, pdfs, listError: false };
        } catch {
          return { msg, pdfs: null, listError: true };
        }
      }
    );

    for (const item of scanned) {
      const msg = item.msg;
      if (!isO365PdfBackfillEnabled()) {
        stopped = true;
        pageComplete = false;
        stoppedMidPage = true;
        break;
      }
      if (
        pdfsUploaded >= O365_PDF_BACKFILL_MAX_PDFS_PER_RUN ||
        messagesSeen >= O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN
      ) {
        pageComplete = false;
        stoppedMidPage = true;
        break;
      }
      messagesSeen += 1;
      bumpReachedYmd(msg.receivedDateTime);

      if (item.listError) {
        appendO365PdfBackfillLog({
          receivedAt: msg.receivedDateTime,
          subject: msg.subject,
          outcome: "attachment_error",
          detail: "Anhänge nicht lesbar",
        });
        continue;
      }

      const pdfs = item.pdfs || [];
      if (pdfs.length === 0) {
        appendO365PdfBackfillLog({
          receivedAt: msg.receivedDateTime,
          subject: msg.subject,
          outcome: "skipped_no_pdf",
        });
        continue;
      }
      messagesWithPdf += 1;

      const pending = pdfs.filter(
        (p) => !findDocumentForMicrosoftAttachment(msg.id, p.id)
      );
      if (pending.length === 0) {
        pdfsSkipped += pdfs.length;
        appendO365PdfBackfillLog({
          receivedAt: msg.receivedDateTime,
          subject: msg.subject,
          outcome: "skipped_already",
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
        messagesWithPdfThisBatch: messagesWithPdf,
        pdfsSkippedThisBatch: pdfsSkipped,
        pdfsFailedThisBatch: pdfsFailed,
        detail: `Lade ${pending.length} PDF(s) nach Paperless…`,
      });

      const { results } = await ingestMicrosoftMessagePdfs({
        userId,
        messageId: msg.id,
        attachments: pending,
        subject: msg.subject,
        tagIds,
        waitIntervalMs: O365_PDF_BACKFILL_PAPERLESS_POLL_MS,
        waitTimeoutMs: O365_PDF_BACKFILL_PAPERLESS_TIMEOUT_MS,
        shouldAbort: () => !isO365PdfBackfillEnabled(),
        concurrency: O365_PDF_BACKFILL_UPLOAD_CONCURRENCY,
      });
      let mailNew = 0;
      let mailFail = 0;
      let mailSkip = 0;
      const errBits: string[] = [];
      for (const r of results) {
        if (r.ok && r.skipped === "already") {
          pdfsSkipped += 1;
          mailSkip += 1;
        } else if (r.ok) {
          pdfsUploaded += 1;
          mailNew += 1;
        } else {
          pdfsFailed += 1;
          mailFail += 1;
          if (r.error) errBits.push(r.error);
        }
      }
      if (mailFail > 0 && mailNew === 0) {
        appendO365PdfBackfillLog({
          receivedAt: msg.receivedDateTime,
          subject: msg.subject,
          outcome: "upload_error",
          pdfFailed: mailFail,
          detail: errBits[0] || `${mailFail} PDF-Fehler`,
        });
        // Cursor bleibt auf dieser Seite — nächster Lauf retried fehlgeschlagene PDFs.
        pageComplete = false;
        stoppedMidPage = true;
        writeLiveProgress({
          active: true,
          step: "upload_pdf",
          subject: msg.subject,
          receivedDateTime: msg.receivedDateTime,
          messageIndex: messagesSeen,
          messageTotal: O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
          pdfsUploadedThisBatch: pdfsUploaded,
          messagesWithPdfThisBatch: messagesWithPdf,
          pdfsSkippedThisBatch: pdfsSkipped,
          pdfsFailedThisBatch: pdfsFailed,
          detail: `Upload-Fehler · Seite wird wiederholt (${mailFail} PDF)`,
        });
        break;
      } else if (mailNew > 0) {
        appendO365PdfBackfillLog({
          receivedAt: msg.receivedDateTime,
          subject: msg.subject,
          outcome: "uploaded",
          pdfNew: mailNew,
          pdfFailed: mailFail || undefined,
        });
      } else if (mailSkip > 0) {
        appendO365PdfBackfillLog({
          receivedAt: msg.receivedDateTime,
          subject: msg.subject,
          outcome: "skipped_already",
          detail: `${mailSkip} PDF(s) bereits`,
        });
      }
      writeLiveProgress({
        active: true,
        step: "upload_pdf",
        subject: msg.subject,
        receivedDateTime: msg.receivedDateTime,
        messageIndex: messagesSeen,
        messageTotal: O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
        pdfsUploadedThisBatch: pdfsUploaded,
        messagesWithPdfThisBatch: messagesWithPdf,
        pdfsSkippedThisBatch: pdfsSkipped,
        pdfsFailedThisBatch: pdfsFailed,
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

  const reachedYmd = getSetting(O365_PDF_BACKFILL_REACHED_YMD_KEY);
  const note = stopped
    ? `Gestoppt · bis ${reachedYmd || "?"} · ${pdfsUploaded} neu / ${messagesSeen} Mails diese Runde · Cursor bleibt`
    : done
      ? `Crawl fertig · bis ${reachedYmd || "?"} · ${pdfsUploaded} neu, ${messagesSeen} Mails · ${pagesDone} Seite(n)`
      : `Catch-up · bis ${reachedYmd || "?"} · ${pdfsUploaded} neu / ${pdfsSkipped} übersprungen / ${messagesSeen} Mails · ${pagesDone} Seite(n)${
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
    stopped,
    nextLink: done ? null : lastNextLink,
    reachedYmd,
  };
}
