import { getDb } from "@/lib/db/client";
import { getSetting } from "@/lib/db/migrations";
import type { DocumentAnalysis } from "@/lib/ai/schemas";
import { PaperlessClient } from "@/lib/paperless/client";
import { nowIso } from "@/lib/utils/dates";

/** Local review queue after analysis. */
export type TriageStatus = "pending" | "pay" | "ignored" | "done";

export type TriageReason =
  | "invoice"
  | "high_amount"
  | "warranty"
  | "deadline"
  | "travel";

export const TRIAGE_REASON_LABELS: Record<TriageReason, string> = {
  invoice: "Rechnung",
  high_amount: "Hoher Betrag",
  warranty: "Garantie",
  deadline: "Frist",
  travel: "Reise",
};

export const HIGH_AMOUNT_CHF = 500;

const ALL_REASONS: TriageReason[] = [
  "invoice",
  "high_amount",
  "warranty",
  "deadline",
  "travel",
];

function aiIconPublicUrl(aiIconPath: string | null | undefined): string | null {
  if (!aiIconPath) return null;
  const base = aiIconPath.replace(/^.*[/\\]/, "").trim();
  if (!base || base.includes("..")) return null;
  return `/api/documents/media/ai-icon/${encodeURIComponent(base)}`;
}

export function parseTriageReasons(
  raw: string | null | undefined
): TriageReason[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is TriageReason =>
        typeof r === "string" && (ALL_REASONS as string[]).includes(r)
    );
  } catch {
    return [];
  }
}

export function detectTriageReasons(
  analysis: DocumentAnalysis,
  options?: {
    documentType?: string | null;
    content?: string | null;
  }
): TriageReason[] {
  const reasons: TriageReason[] = [];
  const docType = (options?.documentType || "").toLowerCase();
  const content = (options?.content || "").toLowerCase();
  const category = (analysis.category || "").toLowerCase();

  const financeRows = analysis.financial_items || [];
  const amountRows = analysis.amounts || [];
  const hasAmount =
    financeRows.some((f) => f.amount != null && Number(f.amount) > 0) ||
    amountRows.some((a) => a.amount != null && Number(a.amount) > 0);
  const hasDue = financeRows.some(
    (f) => f.due_date != null && String(f.due_date).trim() !== ""
  );
  const maxAmount = Math.max(
    0,
    ...financeRows.map((f) => Number(f.amount) || 0),
    ...amountRows.map((a) => Number(a.amount) || 0)
  );

  const looksFinanceCategory =
    /finanz|rechnung|einkauf|steuer|versicherung/.test(category);
  const looksInvoiceType =
    /rechnung|invoice|quittung|beleg|mahnung|offerte|gutschrift/.test(docType);
  const ocrPaymentHints =
    /iban|qr[- ]?rechnung|zahlbar|f[aä]llig|mwst|mehrwertsteuer|betrag\s*chf|total\s*chf|zu\s*zahlen/.test(
      content
    );

  if (
    hasAmount &&
    (looksFinanceCategory ||
      looksInvoiceType ||
      ocrPaymentHints ||
      hasDue ||
      financeRows.length > 0)
  ) {
    reasons.push("invoice");
  }
  if (hasAmount && maxAmount >= HIGH_AMOUNT_CHF) {
    reasons.push("high_amount");
  }

  const warranty = analysis.warranty_info;
  if (
    warranty?.has_warranty &&
    (warranty.warranty_until || warranty.product_name || warranty.serial_number)
  ) {
    reasons.push("warranty");
  }

  if (
    (analysis.deadlines || []).some(
      (d) => d.date != null && String(d.date).trim() !== ""
    )
  ) {
    reasons.push("deadline");
  }

  if ((analysis.travel_items || []).length > 0) {
    reasons.push("travel");
  }

  return [...new Set(reasons)];
}

/**
 * After AI analysis: enqueue for dashboard triage when signals found.
 * Does not override a human decision (pay / ignored / done).
 * Skips docs already marked «Zu bezahlen» in Paperless/Buddy.
 */
export function applyTriageAfterAnalysis(
  documentId: number,
  analysis: DocumentAnalysis
): { queued: boolean; reasons: TriageReason[] } {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT triage_status, zu_bezahlen, bezahlt, document_type_name, content
       FROM paperless_documents WHERE id = ?`
    )
    .get(documentId) as
    | {
        triage_status: string | null;
        zu_bezahlen: number | null;
        bezahlt: number | null;
        document_type_name: string | null;
        content: string | null;
      }
    | undefined;

  if (!row) return { queued: false, reasons: [] };

  const status = row.triage_status;
  if (status === "pay" || status === "ignored" || status === "done") {
    return { queued: false, reasons: [] };
  }

  if (Number(row.zu_bezahlen) === 1 && Number(row.bezahlt) !== 1) {
    db.prepare(
      `UPDATE paperless_documents
       SET triage_status = 'pay', triage_reasons = ?, triage_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(JSON.stringify(["invoice"]), nowIso(), nowIso(), documentId);
    return { queued: false, reasons: ["invoice"] };
  }

  const reasons = detectTriageReasons(analysis, {
    documentType: row.document_type_name,
    content: row.content,
  });

  if (reasons.length === 0) {
    if (status === "pending") {
      db.prepare(
        `UPDATE paperless_documents
         SET triage_status = NULL, triage_reasons = NULL, triage_at = NULL, updated_at = ?
         WHERE id = ?`
      ).run(nowIso(), documentId);
    }
    return { queued: false, reasons: [] };
  }

  db.prepare(
    `UPDATE paperless_documents
     SET triage_status = 'pending', triage_reasons = ?, triage_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(JSON.stringify(reasons), nowIso(), nowIso(), documentId);

  return { queued: true, reasons };
}

export type TriageInboxItem = {
  id: number;
  paperless_id: number;
  title: string | null;
  correspondent_name: string | null;
  document_type_name: string | null;
  category: string | null;
  short_summary: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null;
  vendor: string | null;
  reasons: TriageReason[];
  triage_at: string | null;
  ai_icon_url: string | null;
};

export function listPendingTriageDocuments(limit = 12): TriageInboxItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT d.id, d.paperless_id, d.title, d.correspondent_name,
              d.document_type_name, d.triage_reasons, d.triage_at, d.ai_icon_path,
              s.category, s.short_summary,
              (SELECT f.amount FROM financial_items f
               WHERE f.document_id = d.id
               ORDER BY f.id LIMIT 1) AS amount,
              (SELECT f.currency FROM financial_items f
               WHERE f.document_id = d.id
               ORDER BY f.id LIMIT 1) AS currency,
              (SELECT f.due_date FROM financial_items f
               WHERE f.document_id = d.id
               ORDER BY f.id LIMIT 1) AS due_date,
              (SELECT f.vendor FROM financial_items f
               WHERE f.document_id = d.id
               ORDER BY f.id LIMIT 1) AS vendor
       FROM paperless_documents d
       LEFT JOIN document_summaries s ON s.document_id = d.id
       WHERE d.triage_status = 'pending'
         AND COALESCE(d.sync_status, 'synced') != 'missing'
       ORDER BY COALESCE(d.triage_at, d.updated_at) DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    id: number;
    paperless_id: number;
    title: string | null;
    correspondent_name: string | null;
    document_type_name: string | null;
    triage_reasons: string | null;
    triage_at: string | null;
    ai_icon_path: string | null;
    category: string | null;
    short_summary: string | null;
    amount: number | null;
    currency: string | null;
    due_date: string | null;
    vendor: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    paperless_id: row.paperless_id,
    title: row.title,
    correspondent_name: row.correspondent_name,
    document_type_name: row.document_type_name,
    category: row.category,
    short_summary: row.short_summary,
    amount: row.amount,
    currency: row.currency,
    due_date: row.due_date,
    vendor: row.vendor,
    reasons: parseTriageReasons(row.triage_reasons),
    triage_at: row.triage_at,
    ai_icon_url: aiIconPublicUrl(row.ai_icon_path),
  }));
}

export type TriageAction = "pay" | "ignore" | "done";

/**
 * Resolve a pending triage item.
 * - pay: set Paperless/Buddy «Zu bezahlen»
 * - ignore: leave payment flags alone
 * - done: acknowledge (e.g. warranty/travel only)
 */
export async function resolveDocumentTriage(input: {
  documentLocalId: number;
  action: TriageAction;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const current = db
    .prepare(
      `SELECT triage_status, paperless_id FROM paperless_documents WHERE id = ?`
    )
    .get(input.documentLocalId) as
    | { triage_status: string | null; paperless_id: number }
    | undefined;
  if (!current) return { ok: false, error: "Dokument nicht gefunden" };
  if (current.triage_status !== "pending") {
    return { ok: false, error: "Dokument ist nicht in der Prüfliste" };
  }

  const ts = nowIso();

  if (input.action === "pay") {
    db.prepare(
      `UPDATE paperless_documents
       SET zu_bezahlen = 1, bezahlt = 0,
           triage_status = 'pay', triage_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(ts, ts, input.documentLocalId);

    const baseUrl = getSetting("paperless_base_url");
    const apiToken = getSetting("paperless_api_token");
    const publicUrl = getSetting("paperless_public_url") || baseUrl;
    if (baseUrl && apiToken) {
      try {
        const client = new PaperlessClient(baseUrl, apiToken, publicUrl);
        await client.setPaymentFlags(current.paperless_id, {
          zuBezahlen: true,
          bezahlt: false,
        });
        try {
          const remote = await client.getDocument(current.paperless_id);
          db.prepare(
            `UPDATE paperless_documents SET raw_metadata = ?, updated_at = ? WHERE id = ?`
          ).run(JSON.stringify(remote), ts, input.documentLocalId);
        } catch {
          /* ignore */
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: `Lokal markiert, Paperless-Writeback fehlgeschlagen: ${message}`,
        };
      }
    }
  } else {
    const nextStatus: TriageStatus =
      input.action === "ignore" ? "ignored" : "done";
    db.prepare(
      `UPDATE paperless_documents
       SET triage_status = ?, triage_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextStatus, ts, ts, input.documentLocalId);
  }

  try {
    const { notifyDocumentTriageResolved } = await import(
      "@/lib/realtime/notify"
    );
    notifyDocumentTriageResolved(input.documentLocalId, input.action);
  } catch {
    const { publishInboxRefresh } = await import("@/lib/realtime/hub");
    publishInboxRefresh();
  }

  return { ok: true };
}
