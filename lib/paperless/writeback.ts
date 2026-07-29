import { getDb } from "@/lib/db/client";
import { getPaperlessSettings } from "@/lib/db/queries";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { PaperlessClient } from "@/lib/paperless/client";
import {
  BUDDY_CUSTOM_FIELD_NAMES,
  buddyCategoryTag,
  buddyLedgerTag,
  buddyTripTag,
  coerceCustomFieldValue,
  findCustomFieldDef,
} from "@/lib/paperless/custom-fields";
import { normalizeFinanceCategory } from "@/lib/extraction/normalize-categories";

const WRITEBACK_ENABLED_KEY = "paperless_writeback_enabled";
const WEBHOOK_SECRET_KEY = "paperless_webhook_secret";
const LAST_WRITEBACK_ERROR_KEY = "paperless_writeback_last_error";

export function isPaperlessWritebackEnabled(): boolean {
  const stored = getSetting(WRITEBACK_ENABLED_KEY);
  if (stored == null || stored === "") return true;
  return stored !== "0" && stored.toLowerCase() !== "false";
}

export function setPaperlessWritebackEnabled(enabled: boolean): void {
  setSetting(WRITEBACK_ENABLED_KEY, enabled ? "1" : "0");
}

export function getPaperlessWebhookSecret(): string | null {
  return getSetting(WEBHOOK_SECRET_KEY)?.trim() || null;
}

export function setPaperlessWebhookSecret(secret: string | null): void {
  setSetting(WEBHOOK_SECRET_KEY, secret?.trim() || "");
}

export function getLastWritebackError(): string | null {
  return getSetting(LAST_WRITEBACK_ERROR_KEY)?.trim() || null;
}

function rememberWritebackError(message: string | null): void {
  setSetting(LAST_WRITEBACK_ERROR_KEY, message?.slice(0, 500) || "");
}

function createClientOrNull(): PaperlessClient | null {
  const { baseUrl, apiToken } = getPaperlessSettings();
  if (!baseUrl || !apiToken) return null;
  return new PaperlessClient(baseUrl, apiToken);
}

type AnalysisSnapshot = {
  paperlessId: number;
  category: string | null;
  zuBezahlen: number | null;
  bezahlt: number | null;
  finance: {
    vendor: string | null;
    amount: number | null;
    currency: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    category: string | null;
  } | null;
  warranty: {
    productName: string | null;
    serial: string | null;
    warrantyUntil: string | null;
  } | null;
};

function loadAnalysisSnapshot(localDocumentId: number): AnalysisSnapshot | null {
  const db = getDb();
  const doc = db
    .prepare(
      `SELECT paperless_id, zu_bezahlen, bezahlt FROM paperless_documents WHERE id = ?`
    )
    .get(localDocumentId) as
    | {
        paperless_id: number;
        zu_bezahlen: number | null;
        bezahlt: number | null;
      }
    | undefined;
  if (!doc) return null;

  const summary = db
    .prepare(
      `SELECT category FROM document_summaries WHERE document_id = ? AND analysis_status = 'completed'`
    )
    .get(localDocumentId) as { category: string | null } | undefined;

  const finance = db
    .prepare(
      `SELECT vendor, amount, currency, invoice_date, due_date, category
       FROM financial_items WHERE document_id = ?
       ORDER BY id ASC LIMIT 1`
    )
    .get(localDocumentId) as
    | {
        vendor: string | null;
        amount: number | null;
        currency: string | null;
        invoice_date: string | null;
        due_date: string | null;
        category: string | null;
      }
    | undefined;

  const warranty = db
    .prepare(
      `SELECT product_name, serial_number, warranty_until
       FROM devices_and_warranties WHERE document_id = ?
       ORDER BY id ASC LIMIT 1`
    )
    .get(localDocumentId) as
    | {
        product_name: string | null;
        serial_number: string | null;
        warranty_until: string | null;
      }
    | undefined;

  return {
    paperlessId: doc.paperless_id,
    category: summary?.category ?? null,
    zuBezahlen: doc.zu_bezahlen,
    bezahlt: doc.bezahlt,
    finance: finance
      ? {
          vendor: finance.vendor,
          amount: finance.amount,
          currency: finance.currency,
          invoiceDate: finance.invoice_date,
          dueDate: finance.due_date,
          category: finance.category,
        }
      : null,
    warranty: warranty
      ? {
          productName: warranty.product_name,
          serial: warranty.serial_number,
          warrantyUntil: warranty.warranty_until,
        }
      : null,
  };
}

function resolveBuddyStatus(snapshot: AnalysisSnapshot): string {
  if (Number(snapshot.bezahlt) === 1) return "bezahlt";
  if (Number(snapshot.zuBezahlen) === 1) return "offen";
  return "archiv";
}

/**
 * Write analysis-derived metadata back to Paperless.
 */
export async function writebackAnalysisToPaperless(
  localDocumentId: number
): Promise<{ ok: boolean; error?: string }> {
  if (!isPaperlessWritebackEnabled()) {
    return { ok: true };
  }
  const client = createClientOrNull();
  if (!client) {
    return { ok: false, error: "Paperless nicht konfiguriert" };
  }

  try {
    const snapshot = loadAnalysisSnapshot(localDocumentId);
    if (!snapshot) {
      return { ok: false, error: "Dokument nicht gefunden" };
    }

    const fieldDefs = await client.listCustomFields();
    const customFields: Array<{ field: number; value: unknown }> = [];

    const put = (exactName: string, raw: unknown) => {
      if (raw == null || raw === "") return;
      const def = findCustomFieldDef(fieldDefs, exactName);
      if (!def) return;
      const coerced = coerceCustomFieldValue(def.data_type, raw);
      if (coerced == null || coerced === "") return;
      customFields.push({ field: def.id, value: coerced });
    };

    if (snapshot.finance) {
      put(BUDDY_CUSTOM_FIELD_NAMES.amount, snapshot.finance.amount);
      put(BUDDY_CUSTOM_FIELD_NAMES.currency, snapshot.finance.currency || "CHF");
      put(BUDDY_CUSTOM_FIELD_NAMES.dueDate, snapshot.finance.dueDate);
      put(BUDDY_CUSTOM_FIELD_NAMES.invoiceDate, snapshot.finance.invoiceDate);
      put(BUDDY_CUSTOM_FIELD_NAMES.vendor, snapshot.finance.vendor);
      put(
        BUDDY_CUSTOM_FIELD_NAMES.financeCategory,
        snapshot.finance.category
          ? normalizeFinanceCategory(snapshot.finance.category)
          : null
      );
    }
    if (snapshot.warranty) {
      put(BUDDY_CUSTOM_FIELD_NAMES.warrantyUntil, snapshot.warranty.warrantyUntil);
      put(BUDDY_CUSTOM_FIELD_NAMES.product, snapshot.warranty.productName);
      put(BUDDY_CUSTOM_FIELD_NAMES.serial, snapshot.warranty.serial);
    }
    if (snapshot.category) {
      put(BUDDY_CUSTOM_FIELD_NAMES.buddyCategory, snapshot.category);
    }
    put(BUDDY_CUSTOM_FIELD_NAMES.buddyStatus, resolveBuddyStatus(snapshot));

    const tagNames = ["buddy:analysiert"];
    if (snapshot.category) {
      tagNames.push(buddyCategoryTag(snapshot.category));
    }
    if (Number(snapshot.bezahlt) === 1) tagNames.push("buddy:bezahlt");
    else if (Number(snapshot.zuBezahlen) === 1) tagNames.push("buddy:offen");

    const tagCache = new Map<string, number>();
    const addTagIds: number[] = [];
    for (const name of tagNames) {
      addTagIds.push(await client.ensureTag(name, tagCache));
    }

    let correspondentId: number | undefined;
    const corrName = snapshot.finance?.vendor?.trim() || null;
    if (corrName) {
      correspondentId = await client.ensureCorrespondent(corrName, new Map());
    }

    let documentTypeId: number | undefined;
    if (snapshot.category) {
      const found = await client.findDocumentTypeIdByName(snapshot.category);
      if (found != null) documentTypeId = found;
    }

    await client.setDocumentMetadata(snapshot.paperlessId, {
      addTagIds,
      customFields,
      correspondentId,
      documentTypeId,
    });

    rememberWritebackError(null);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[paperless writeback]", localDocumentId, message);
    rememberWritebackError(message);
    return { ok: false, error: message };
  }
}

export async function writebackLinkTagsToPaperless(input: {
  localDocumentId: number;
  tripId?: number;
  tripTitle?: string | null;
  ledgerId?: number;
  ledgerTitle?: string | null;
  buddyStatus?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPaperlessWritebackEnabled()) return { ok: true };
  const client = createClientOrNull();
  if (!client) return { ok: false, error: "Paperless nicht konfiguriert" };

  try {
    const db = getDb();
    const doc = db
      .prepare(`SELECT paperless_id FROM paperless_documents WHERE id = ?`)
      .get(input.localDocumentId) as { paperless_id: number } | undefined;
    if (!doc) return { ok: false, error: "Dokument nicht gefunden" };

    const tagNames: string[] = [];
    if (input.tripId != null) {
      tagNames.push(buddyTripTag(input.tripId, input.tripTitle));
    }
    if (input.ledgerId != null) {
      tagNames.push(buddyLedgerTag(input.ledgerId, input.ledgerTitle));
    }

    const tagCache = new Map<string, number>();
    const addTagIds: number[] = [];
    for (const name of tagNames) {
      addTagIds.push(await client.ensureTag(name, tagCache));
    }

    const customFields: Array<{ field: number; value: unknown }> = [];
    if (input.buddyStatus) {
      const fieldDefs = await client.listCustomFields();
      const def = findCustomFieldDef(
        fieldDefs,
        BUDDY_CUSTOM_FIELD_NAMES.buddyStatus
      );
      if (def) {
        customFields.push({
          field: def.id,
          value: coerceCustomFieldValue(def.data_type, input.buddyStatus),
        });
      }
    }

    await client.setDocumentMetadata(doc.paperless_id, {
      addTagIds,
      customFields,
    });
    rememberWritebackError(null);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[paperless link writeback]", message);
    rememberWritebackError(message);
    return { ok: false, error: message };
  }
}

export async function writebackStatusFlagsToPaperless(input: {
  localDocumentId: number;
  buddyReviewed?: boolean;
  taxRelevant?: boolean;
  buddyStatus?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPaperlessWritebackEnabled()) return { ok: true };
  const client = createClientOrNull();
  if (!client) return { ok: false, error: "Paperless nicht konfiguriert" };

  try {
    const db = getDb();
    const doc = db
      .prepare(`SELECT paperless_id FROM paperless_documents WHERE id = ?`)
      .get(input.localDocumentId) as { paperless_id: number } | undefined;
    if (!doc) return { ok: false, error: "Dokument nicht gefunden" };

    const fieldDefs = await client.listCustomFields();
    const customFields: Array<{ field: number; value: unknown }> = [];
    const put = (exactName: string, raw: unknown) => {
      if (raw === undefined) return;
      const def = findCustomFieldDef(fieldDefs, exactName);
      if (!def) return;
      customFields.push({
        field: def.id,
        value: coerceCustomFieldValue(def.data_type, raw),
      });
    };

    if (input.buddyReviewed !== undefined) {
      put(BUDDY_CUSTOM_FIELD_NAMES.buddyReviewed, input.buddyReviewed);
    }
    if (input.taxRelevant !== undefined) {
      put(BUDDY_CUSTOM_FIELD_NAMES.taxRelevant, input.taxRelevant);
    }
    if (input.buddyStatus !== undefined && input.buddyStatus != null) {
      put(BUDDY_CUSTOM_FIELD_NAMES.buddyStatus, input.buddyStatus);
    }

    await client.setDocumentMetadata(doc.paperless_id, { customFields });

    try {
      const remote = await client.getDocument(doc.paperless_id);
      db.prepare(
        `UPDATE paperless_documents SET raw_metadata = ?, updated_at = ? WHERE id = ?`
      ).run(
        JSON.stringify(remote),
        new Date().toISOString(),
        input.localDocumentId
      );
    } catch {
      /* ignore refresh */
    }

    rememberWritebackError(null);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    rememberWritebackError(message);
    return { ok: false, error: message };
  }
}
