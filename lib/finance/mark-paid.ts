import {
  getDocumentsByLocalIds,
  getPaperlessSettings,
  setDocumentsPaidLocally,
} from "@/lib/db/queries";
import { PaperlessClient, PaperlessError } from "@/lib/paperless/client";

export type MarkPaidResult = {
  ok: boolean;
  markedLocal: number;
  writtenPaperless: number;
  errors: Array<{ documentLocalId: number; error: string }>;
};

/**
 * Mark invoices as paid locally and write «Bezahlt=true» / «Zu bezahlen=false»
 * back to Paperless.
 */
export async function markDocumentsPaid(
  documentLocalIds: number[]
): Promise<MarkPaidResult> {
  const uniqueIds = [...new Set(documentLocalIds.filter((id) => id > 0))];
  const errors: MarkPaidResult["errors"] = [];
  if (uniqueIds.length === 0) {
    return { ok: true, markedLocal: 0, writtenPaperless: 0, errors };
  }

  const docs = getDocumentsByLocalIds(uniqueIds);
  const found = new Set(docs.map((d) => d.id));
  for (const id of uniqueIds) {
    if (!found.has(id)) {
      errors.push({
        documentLocalId: id,
        error: "Dokument lokal nicht gefunden",
      });
    }
  }

  const settings = getPaperlessSettings();
  if (!settings.baseUrl || !settings.apiToken) {
    // Still mark locally so UI stays consistent offline
    const markedLocal = setDocumentsPaidLocally(docs.map((d) => d.id));
    for (const d of docs) {
      errors.push({
        documentLocalId: d.id,
        error:
          "Paperless nicht konfiguriert – nur lokal als beglichen markiert",
      });
    }
    return {
      ok: errors.length === 0,
      markedLocal,
      writtenPaperless: 0,
      errors,
    };
  }

  const client = new PaperlessClient(
    settings.baseUrl,
    settings.apiToken,
    settings.publicUrl
  );
  let fieldDefs: Awaited<ReturnType<typeof client.listCustomFields>> = [];
  try {
    fieldDefs = await client.listCustomFields();
  } catch (err) {
    const message =
      err instanceof PaperlessError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const markedLocal = setDocumentsPaidLocally(docs.map((d) => d.id));
    for (const d of docs) {
      errors.push({
        documentLocalId: d.id,
        error: `Paperless-Felder nicht lesbar (${message}) – nur lokal markiert`,
      });
    }
    return {
      ok: false,
      markedLocal,
      writtenPaperless: 0,
      errors,
    };
  }

  const succeededLocalIds: number[] = [];
  let writtenPaperless = 0;

  for (const doc of docs) {
    try {
      await client.setPaymentFlags(
        doc.paperless_id,
        { bezahlt: true, zuBezahlen: false },
        fieldDefs
      );
      try {
        const { appendPaperlessFieldSyncLogs } = await import(
          "@/lib/paperless/sync-log"
        );
        appendPaperlessFieldSyncLogs([
          {
            direction: "push",
            source: "mark_paid",
            status: "ok",
            kind: "payment_flag",
            fieldName: "Bezahlt",
            fieldValue: true,
            documentLocalId: doc.id,
            paperlessId: doc.paperless_id,
            documentTitle: doc.title,
          },
          {
            direction: "push",
            source: "mark_paid",
            status: "ok",
            kind: "payment_flag",
            fieldName: "Zu bezahlen",
            fieldValue: false,
            documentLocalId: doc.id,
            paperlessId: doc.paperless_id,
            documentTitle: doc.title,
          },
        ]);
      } catch {
        /* ignore log errors */
      }
      try {
        const { writebackStatusFlagsToPaperless } = await import(
          "@/lib/paperless/writeback"
        );
        await writebackStatusFlagsToPaperless({
          localDocumentId: doc.id,
          buddyStatus: "bezahlt",
        });
      } catch {
        /* optional status field */
      }
      succeededLocalIds.push(doc.id);
      writtenPaperless += 1;
    } catch (err) {
      const message =
        err instanceof PaperlessError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      // Still mark locally so the invoice leaves the open list after user intent
      succeededLocalIds.push(doc.id);
      errors.push({
        documentLocalId: doc.id,
        error: `Paperless-Writeback fehlgeschlagen: ${message} (lokal trotzdem markiert)`,
      });
    }
  }

  const markedLocal = setDocumentsPaidLocally(succeededLocalIds);
  try {
    const { notifyMarkedPaid } = await import("@/lib/realtime/notify");
    for (const id of succeededLocalIds) {
      notifyMarkedPaid(id);
    }
  } catch {
    /* ignore */
  }
  return {
    ok: errors.length === 0,
    markedLocal,
    writtenPaperless,
    errors,
  };
}
