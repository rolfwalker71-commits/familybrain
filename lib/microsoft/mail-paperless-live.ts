import { graphJson } from "@/lib/microsoft/graph";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { findDocumentForMicrosoftAttachment } from "@/lib/buddy/source-links";
import {
  listMicrosoftPdfAttachments,
  type MicrosoftMailAttachmentMeta,
} from "@/lib/microsoft/mail-attachments";
import {
  ingestMicrosoftMessagePdfs,
  resolveO365TagIdsCached,
} from "@/lib/microsoft/mail-to-paperless";
import { isO365PdfBackfillEnabled } from "@/lib/microsoft/mail-paperless-backfill";

export const O365_PDF_LIVE_ENABLED_KEY = "o365_pdf_live_enabled";
export const O365_PDF_LIVE_WATERMARK_KEY = "o365_pdf_live_watermark";
export const O365_PDF_LIVE_INTERVAL_KEY = "o365_pdf_live_interval_minutes";
export const O365_PDF_LIVE_LAST_RUN_KEY = "o365_pdf_live_last_run_at";
export const O365_PDF_LIVE_LAST_ERROR_KEY = "o365_pdf_live_last_error";
export const O365_PDF_LIVE_LAST_NOTE_KEY = "o365_pdf_live_last_note";
export const O365_PDF_LIVE_LAST_ATTEMPT_KEY = "o365_pdf_live_last_attempt_at";

/** Default off — must not compete with historical catch-up. */
export const O365_PDF_LIVE_DEFAULT_ENABLED = false;
export const O365_PDF_LIVE_DEFAULT_INTERVAL_MINUTES = 15;
export const O365_PDF_LIVE_MIN_INTERVAL_MINUTES = 5;
export const O365_PDF_LIVE_MAX_INTERVAL_MINUTES = 120;

export const O365_PDF_LIVE_PAGE_SIZE = 50;
export const O365_PDF_LIVE_MAX_PAGES = 4;
export const O365_PDF_LIVE_MAX_PDFS = 30;
export const O365_PDF_LIVE_SCAN_CONCURRENCY = 10;
export const O365_PDF_LIVE_UPLOAD_CONCURRENCY = 3;
/** Overlap so edge-of-window mails are not missed. */
export const O365_PDF_LIVE_OVERLAP_MS = 2 * 60 * 1000;

type GraphMessageLite = {
  id?: string;
  subject?: string | null;
  hasAttachments?: boolean;
  receivedDateTime?: string | null;
};

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

export function clampO365PdfLiveIntervalMinutes(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return O365_PDF_LIVE_DEFAULT_INTERVAL_MINUTES;
  return Math.max(
    O365_PDF_LIVE_MIN_INTERVAL_MINUTES,
    Math.min(O365_PDF_LIVE_MAX_INTERVAL_MINUTES, Math.round(n))
  );
}

export function isO365PdfLiveEnabled(): boolean {
  const v = getSetting(O365_PDF_LIVE_ENABLED_KEY);
  if (v == null || v === "") return O365_PDF_LIVE_DEFAULT_ENABLED;
  return v === "1" || v.toLowerCase() === "true";
}

/** Historical catch-up chain owns the job lease — live waits. */
export function isO365PdfBackfillBlockingLive(): boolean {
  return isO365PdfBackfillEnabled();
}

export function getO365PdfLiveWatermark(): string | null {
  const raw = getSetting(O365_PDF_LIVE_WATERMARK_KEY)?.trim();
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Ensure watermark exists when enabling — only mails after this point. */
export function ensureO365PdfLiveWatermark(now = new Date()): string {
  const existing = getO365PdfLiveWatermark();
  if (existing) return existing;
  const iso = now.toISOString();
  setSetting(O365_PDF_LIVE_WATERMARK_KEY, iso);
  return iso;
}

export function configureO365PdfLive(input: {
  enabled?: boolean;
  intervalMinutes?: number;
  /** Reset watermark to now (only new mail from this moment). */
  resetWatermark?: boolean;
}): void {
  if (input.enabled !== undefined) {
    setSetting(O365_PDF_LIVE_ENABLED_KEY, input.enabled ? "1" : "0");
    if (input.enabled) {
      ensureO365PdfLiveWatermark();
      setSetting(
        O365_PDF_LIVE_LAST_NOTE_KEY,
        isO365PdfBackfillBlockingLive()
          ? "Laufender Import aktiv — wartet, bis Catch-up gestoppt/fertig ist."
          : "Laufender Import aktiv — Scheduler holt neue PDFs periodisch."
      );
    } else {
      setSetting(O365_PDF_LIVE_LAST_NOTE_KEY, "Laufender Import aus.");
    }
  }
  if (input.intervalMinutes !== undefined) {
    setSetting(
      O365_PDF_LIVE_INTERVAL_KEY,
      String(clampO365PdfLiveIntervalMinutes(input.intervalMinutes))
    );
  }
  if (input.resetWatermark) {
    const iso = new Date().toISOString();
    setSetting(O365_PDF_LIVE_WATERMARK_KEY, iso);
    setSetting(
      O365_PDF_LIVE_LAST_NOTE_KEY,
      `Wasserzeichen auf jetzt gesetzt (${iso}).`
    );
  }
}

export type O365PdfLiveStatus = {
  enabled: boolean;
  intervalMinutes: number;
  watermark: string | null;
  lastRunAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastNote: string | null;
  blockedByBackfill: boolean;
};

export function getO365PdfLiveStatus(): O365PdfLiveStatus {
  const intervalRaw = getSetting(O365_PDF_LIVE_INTERVAL_KEY);
  return {
    enabled: isO365PdfLiveEnabled(),
    intervalMinutes: clampO365PdfLiveIntervalMinutes(intervalRaw),
    watermark: getO365PdfLiveWatermark(),
    lastRunAt: getSetting(O365_PDF_LIVE_LAST_RUN_KEY),
    lastAttemptAt: getSetting(O365_PDF_LIVE_LAST_ATTEMPT_KEY),
    lastError: getSetting(O365_PDF_LIVE_LAST_ERROR_KEY),
    lastNote: getSetting(O365_PDF_LIVE_LAST_NOTE_KEY),
    blockedByBackfill: isO365PdfBackfillBlockingLive(),
  };
}

/** Due for scheduler tick (respects interval). */
export function isO365PdfLiveDue(now = new Date()): boolean {
  if (!isO365PdfLiveEnabled()) return false;
  if (isO365PdfBackfillBlockingLive()) return false;
  const last = getSetting(O365_PDF_LIVE_LAST_ATTEMPT_KEY);
  if (!last) return true;
  const t = new Date(last).getTime();
  if (!Number.isFinite(t)) return true;
  const intervalMs =
    clampO365PdfLiveIntervalMinutes(getSetting(O365_PDF_LIVE_INTERVAL_KEY)) *
    60 *
    1000;
  return now.getTime() - t >= intervalMs;
}

function toGraphDateTimeOffset(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`Ungültiges Wasserzeichen: ${iso}`);
  }
  return d.toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

async function listInboxAttachmentsSincePage(
  userId: number,
  options: {
    sinceIso: string;
    nextLink?: string | null;
    pageSize?: number;
  }
): Promise<{
  messages: Array<{
    id: string;
    subject: string;
    receivedDateTime: string | null;
  }>;
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
    const start = toGraphDateTimeOffset(options.sinceIso);
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

export type O365PdfLiveRunResult = {
  skipped?: string;
  messagesSeen: number;
  messagesWithPdf: number;
  pdfsUploaded: number;
  pdfsSkipped: number;
  pdfsFailed: number;
  watermark: string | null;
};

/**
 * Incremental import: mails with attachments since watermark (overlap).
 * Idempotent via source-links. Waits while catch-up is enabled.
 */
export async function runO365PdfLiveBatch(
  userId: number
): Promise<O365PdfLiveRunResult> {
  setSetting(O365_PDF_LIVE_LAST_ATTEMPT_KEY, new Date().toISOString());

  if (!isO365PdfLiveEnabled()) {
    return {
      skipped: "disabled",
      messagesSeen: 0,
      messagesWithPdf: 0,
      pdfsUploaded: 0,
      pdfsSkipped: 0,
      pdfsFailed: 0,
      watermark: getO365PdfLiveWatermark(),
    };
  }

  if (isO365PdfBackfillBlockingLive()) {
    setSetting(
      O365_PDF_LIVE_LAST_NOTE_KEY,
      "Übersprungen: historischer Catch-up ist aktiv — Live wartet."
    );
    return {
      skipped: "backfill_active",
      messagesSeen: 0,
      messagesWithPdf: 0,
      pdfsUploaded: 0,
      pdfsSkipped: 0,
      pdfsFailed: 0,
      watermark: getO365PdfLiveWatermark(),
    };
  }

  const watermark = ensureO365PdfLiveWatermark();
  const sinceMs = new Date(watermark).getTime() - O365_PDF_LIVE_OVERLAP_MS;
  const sinceIso = new Date(Math.max(0, sinceMs)).toISOString();

  const tagIds = await resolveO365TagIdsCached();
  let cursor: string | null = null;
  let pagesDone = 0;
  let messagesSeen = 0;
  let messagesWithPdf = 0;
  let pdfsUploaded = 0;
  let pdfsSkipped = 0;
  let pdfsFailed = 0;
  let maxReceivedMs = new Date(watermark).getTime();

  while (
    pagesDone < O365_PDF_LIVE_MAX_PAGES &&
    pdfsUploaded < O365_PDF_LIVE_MAX_PDFS
  ) {
    if (!isO365PdfLiveEnabled() || isO365PdfBackfillBlockingLive()) break;

    const page = await listInboxAttachmentsSincePage(userId, {
      sinceIso,
      nextLink: cursor,
      pageSize: O365_PDF_LIVE_PAGE_SIZE,
    });
    pagesDone += 1;

    if (page.messages.length === 0) {
      cursor = page.nextLink;
      break;
    }

    type Scanned = {
      msg: (typeof page.messages)[number];
      pdfs: MicrosoftMailAttachmentMeta[] | null;
      listError: boolean;
    };

    const scanned = await mapPool(
      page.messages,
      O365_PDF_LIVE_SCAN_CONCURRENCY,
      async (msg): Promise<Scanned> => {
        try {
          const pdfs = await listMicrosoftPdfAttachments(userId, msg.id);
          return { msg, pdfs, listError: false };
        } catch {
          return { msg, pdfs: null, listError: true };
        }
      }
    );

    for (const item of scanned) {
      if (!isO365PdfLiveEnabled() || isO365PdfBackfillBlockingLive()) break;
      if (pdfsUploaded >= O365_PDF_LIVE_MAX_PDFS) break;

      const msg = item.msg;
      messagesSeen += 1;
      if (msg.receivedDateTime) {
        const t = new Date(msg.receivedDateTime).getTime();
        if (Number.isFinite(t) && t > maxReceivedMs) maxReceivedMs = t;
      }

      if (item.listError || !item.pdfs?.length) continue;
      messagesWithPdf += 1;

      const pending = item.pdfs.filter(
        (p) => !findDocumentForMicrosoftAttachment(msg.id, p.id)
      );
      if (pending.length === 0) {
        pdfsSkipped += item.pdfs.length;
        continue;
      }

      const { results } = await ingestMicrosoftMessagePdfs({
        userId,
        messageId: msg.id,
        attachments: pending,
        subject: msg.subject,
        tagIds,
        waitIntervalMs: 400,
        concurrency: O365_PDF_LIVE_UPLOAD_CONCURRENCY,
      });
      for (const r of results) {
        if (r.ok && r.skipped === "already") pdfsSkipped += 1;
        else if (r.ok) pdfsUploaded += 1;
        else pdfsFailed += 1;
      }
    }

    cursor = page.nextLink;
    if (!cursor) break;
  }

  const nextWatermark = new Date(maxReceivedMs).toISOString();
  setSetting(O365_PDF_LIVE_WATERMARK_KEY, nextWatermark);
  setSetting(O365_PDF_LIVE_LAST_RUN_KEY, new Date().toISOString());
  setSetting(O365_PDF_LIVE_LAST_ERROR_KEY, null);
  setSetting(
    O365_PDF_LIVE_LAST_NOTE_KEY,
    `Live · ${pdfsUploaded} neu / ${pdfsSkipped} übersprungen / ${pdfsFailed} Fehler · ${messagesSeen} Mails · Wasserzeichen ${nextWatermark}`
  );

  return {
    messagesSeen,
    messagesWithPdf,
    pdfsUploaded,
    pdfsSkipped,
    pdfsFailed,
    watermark: nextWatermark,
  };
}
