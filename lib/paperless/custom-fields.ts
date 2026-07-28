import type { PaperlessDocument } from "./types";

export type PaperlessCustomFieldDef = {
  id: number;
  name: string;
  data_type: string;
};

export type PaperlessCustomFieldValue = {
  field: number;
  name?: string | null;
  value: unknown;
};

/** Normalized payment flags from Paperless UDFs «Zu bezahlen» / «Bezahlt». */
export type PaymentCustomFlags = {
  /** «Zu bezahlen» — null if field absent */
  zuBezahlen: boolean | null;
  /** «Bezahlt» — null if field absent */
  bezahlt: boolean | null;
};

const TO_PAY_NAMES = new Set([
  "zu bezahlen",
  "zubezahlen",
  "to pay",
  "payable",
  "offen",
  "unbezahlt",
]);
const PAID_NAMES = new Set(["bezahlt", "paid", "bezahlt?", "bezahlt ja"]);

function normalizeFieldName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

export function isToPayFieldName(name: string): boolean {
  const n = normalizeFieldName(name);
  if (TO_PAY_NAMES.has(n)) return true;
  // «zu bezahlen» / «zubezahlen» variants
  return n.includes("zu bezahl") || n === "zahlbar";
}

export function isPaidFieldName(name: string): boolean {
  const n = normalizeFieldName(name);
  if (PAID_NAMES.has(n)) return true;
  // Exact-ish: name is just «bezahlt» / «paid», not «zu bezahlen»
  if (n.includes("zu bezahl")) return false;
  return n === "bezahlt" || n.startsWith("bezahlt ") || n === "paid";
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

function fieldIdAndName(rawField: unknown): {
  id: number | null;
  name: string | null;
} {
  if (typeof rawField === "number" && Number.isFinite(rawField)) {
    return { id: rawField, name: null };
  }
  if (typeof rawField === "string" && /^\d+$/.test(rawField.trim())) {
    return { id: Number(rawField.trim()), name: null };
  }
  if (rawField && typeof rawField === "object") {
    const obj = rawField as { id?: unknown; name?: unknown };
    const id = Number(obj.id);
    const name = typeof obj.name === "string" ? obj.name : null;
    return {
      id: Number.isFinite(id) ? id : null,
      name,
    };
  }
  return { id: null, name: null };
}

function extractCustomFieldEntries(
  doc: PaperlessDocument | Record<string, unknown>
): PaperlessCustomFieldValue[] {
  const raw = (doc as { custom_fields?: unknown }).custom_fields;
  if (!Array.isArray(raw)) return [];
  const out: PaperlessCustomFieldValue[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as {
      field?: unknown;
      value?: unknown;
      name?: unknown;
    };
    const parsed = fieldIdAndName(row.field);
    const nameFromEntry =
      typeof row.name === "string"
        ? row.name
        : parsed.name;
    if (parsed.id == null && !nameFromEntry) continue;
    out.push({
      field: parsed.id ?? -1,
      name: nameFromEntry,
      value: row.value,
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
    const name =
      entry.name ||
      (entry.field > 0 ? fieldIdToName.get(entry.field) : undefined);
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
