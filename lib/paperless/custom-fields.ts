import type { PaperlessDocument } from "./types";

export type PaperlessCustomFieldDef = {
  id: number;
  name: string;
  data_type: string;
};

export type PaperlessCustomFieldValue = {
  field: number;
  value: unknown;
};

/** Normalized payment flags from Paperless UDFs «Zu bezahlen» / «Bezahlt». */
export type PaymentCustomFlags = {
  /** «Zu bezahlen» — null if field absent */
  zuBezahlen: boolean | null;
  /** «Bezahlt» — null if field absent */
  bezahlt: boolean | null;
};

const TO_PAY_NAMES = new Set(["zu bezahlen", "zubezahlen", "to pay", "payable"]);
const PAID_NAMES = new Set(["bezahlt", "paid", "bezahlt?"]);

function normalizeFieldName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isToPayFieldName(name: string): boolean {
  return TO_PAY_NAMES.has(normalizeFieldName(name));
}

export function isPaidFieldName(name: string): boolean {
  return PAID_NAMES.has(normalizeFieldName(name));
}

function asBoolean(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return true;
  }
  if (value === false || value === 0 || value === "0" || value === "false") {
    return false;
  }
  if (value == null || value === "") return null;
  return null;
}

function extractCustomFieldEntries(
  doc: PaperlessDocument | Record<string, unknown>
): PaperlessCustomFieldValue[] {
  const raw = (doc as { custom_fields?: unknown }).custom_fields;
  if (!Array.isArray(raw)) return [];
  const out: PaperlessCustomFieldValue[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const field = Number((entry as { field?: unknown }).field);
    if (!Number.isFinite(field)) continue;
    out.push({
      field,
      value: (entry as { value?: unknown }).value,
    });
  }
  return out;
}

/**
 * Resolve payment UDFs from a Paperless document using field-id → name map.
 */
export function extractPaymentCustomFlags(
  doc: PaperlessDocument | Record<string, unknown>,
  fieldIdToName: Map<number, string>
): PaymentCustomFlags {
  let zuBezahlen: boolean | null = null;
  let bezahlt: boolean | null = null;

  for (const entry of extractCustomFieldEntries(doc)) {
    const name = fieldIdToName.get(entry.field);
    if (!name) continue;
    const bool = asBoolean(entry.value);
    if (isToPayFieldName(name)) zuBezahlen = bool;
    else if (isPaidFieldName(name)) bezahlt = bool;
  }

  return { zuBezahlen, bezahlt };
}

/** Open invoice: marked «Zu bezahlen» and not «Bezahlt». */
export function isOpenUnpaidInvoice(flags: {
  zu_bezahlen: number | null | undefined;
  bezahlt: number | null | undefined;
}): boolean {
  return Number(flags.zu_bezahlen) === 1 && Number(flags.bezahlt) !== 1;
}

export function boolToSql(value: boolean | null): number | null {
  if (value === true) return 1;
  if (value === false) return 0;
  return null;
}
