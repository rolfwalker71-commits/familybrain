import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { markDocumentsPaid } from "@/lib/finance/mark-paid";
import type { PaymentMethodId } from "@/lib/finance/payment-methods";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Schedule a payment in the pipeline (stays open until planned date has passed).
 */
export function scheduleDocumentPayment(input: {
  documentLocalId: number;
  paidOn: string;
  method: PaymentMethodId;
}): { ok: boolean; error?: string } {
  const paidOn = input.paidOn.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return { ok: false, error: "Ungültiges Zahldatum" };
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id FROM paperless_documents
       WHERE id = ? AND COALESCE(sync_status, 'synced') != 'missing'`
    )
    .get(input.documentLocalId) as { id: number } | undefined;
  if (!row) return { ok: false, error: "Dokument nicht gefunden" };

  db.prepare(
    `UPDATE paperless_documents
     SET payment_planned_date = ?,
         payment_method = ?,
         zu_bezahlen = 1,
         bezahlt = 0,
         updated_at = ?
     WHERE id = ?`
  ).run(paidOn, input.method, nowIso(), input.documentLocalId);

  return { ok: true };
}

export function clearDocumentPaymentPlan(documentLocalId: number): void {
  getDb()
    .prepare(
      `UPDATE paperless_documents
       SET payment_planned_date = NULL,
           payment_method = NULL,
           updated_at = ?
       WHERE id = ?`
    )
    .run(nowIso(), documentLocalId);
}

/**
 * Finalize pipeline payments whose planned date is before today
 * (Zahldatum abgelaufen → als bezahlt markieren).
 */
export async function finalizeDuePaymentPlans(): Promise<number> {
  const db = getDb();
  const today = todayIso();
  const rows = db
    .prepare(
      `SELECT id FROM paperless_documents
       WHERE payment_planned_date IS NOT NULL
         AND TRIM(payment_planned_date) != ''
         AND payment_planned_date < ?
         AND COALESCE(bezahlt, 0) = 0
         AND COALESCE(sync_status, 'synced') != 'missing'`
    )
    .all(today) as Array<{ id: number }>;

  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  await markDocumentsPaid(ids);
  for (const id of ids) {
    clearDocumentPaymentPlan(id);
  }
  return ids.length;
}
