import type { PaperlessCustomField, PaperlessDocument } from "./types";

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

/** Exact Paperless custom field names Buddy writes (must match Paperless UI). */
export const BUDDY_CUSTOM_FIELD_NAMES = {
  amount: "Betrag",
  currency: "Währung",
  dueDate: "Fälligkeitsdatum",
  invoiceDate: "Rechnungsdatum",
  vendor: "Lieferant",
  financeCategory: "Finanzkategorie",
  warrantyUntil: "Garantie bis",
  product: "Produkt",
  serial: "Seriennummer",
  buddyCategory: "Buddy Kategorie",
  buddyReviewed: "Buddy geprüft",
  taxRelevant: "Steuer relevant",
  forGuide: "Für Guide",
  buddyStatus: "Buddy Status",
} as const;

/** Fields the user must create manually in Paperless (excl. Zu bezahlen / Bezahlt). */
export const BUDDY_WRITEBACK_FIELD_CHECKLIST: ReadonlyArray<{
  name: string;
  dataTypeHint: string;
}> = [
  { name: BUDDY_CUSTOM_FIELD_NAMES.amount, dataTypeHint: "Fließkomma / Monetary" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.currency, dataTypeHint: "Text" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.dueDate, dataTypeHint: "Datum" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.invoiceDate, dataTypeHint: "Datum" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.vendor, dataTypeHint: "Text" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.financeCategory, dataTypeHint: "Text" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.warrantyUntil, dataTypeHint: "Datum" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.product, dataTypeHint: "Text" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.serial, dataTypeHint: "Text" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.buddyCategory, dataTypeHint: "Text" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.buddyReviewed, dataTypeHint: "Wahrheitswert" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.taxRelevant, dataTypeHint: "Wahrheitswert" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.forGuide, dataTypeHint: "Wahrheitswert" },
  { name: BUDDY_CUSTOM_FIELD_NAMES.buddyStatus, dataTypeHint: "Text" },
];

const TO_PAY_NAMES = new Set([
  "zu bezahlen",
  "zubezahlen",
  "to pay",
  "payable",
  "offen",
  "unbezahlt",
  "rechnung offen",
]);
const PAID_NAMES = new Set([
  "bezahlt",
  "paid",
  "bezahlt?",
  "bezahlt ja",
  "rechnung bezahlt",
]);

export function normalizeFieldName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

export function isToPayFieldName(name: string): boolean {
  const n = normalizeFieldName(name);
  if (TO_PAY_NAMES.has(n)) return true;
  if (n.includes("zu bezahl") || n === "zahlbar") return true;
  if (n.includes("offen") && (n.includes("rechnung") || n.includes("invoice"))) {
    return true;
  }
  return false;
}

export function isPaidFieldName(name: string): boolean {
  const n = normalizeFieldName(name);
  if (n.includes("zu bezahl")) return false;
  if (PAID_NAMES.has(n)) return true;
  if (n === "bezahlt" || n.startsWith("bezahlt ") || n === "paid") return true;
  if (
    n.includes("bezahlt") &&
    (n.includes("rechnung") || n.includes("invoice"))
  ) {
    return true;
  }
  return false;
}

export function findCustomFieldId(
  defs: Array<Pick<PaperlessCustomField, "id" | "name">>,
  exactName: string
): number | null {
  const want = normalizeFieldName(exactName);
  for (const def of defs) {
    if (normalizeFieldName(def.name) === want) return def.id;
  }
  return null;
}

export function findCustomFieldDef(
  defs: PaperlessCustomField[],
  exactName: string
): PaperlessCustomField | null {
  const want = normalizeFieldName(exactName);
  for (const def of defs) {
    if (normalizeFieldName(def.name) === want) return def;
  }
  return null;
}

/** Coerce a JS value to what Paperless expects for a data_type. */
export function coerceCustomFieldValue(
  dataType: string | undefined,
  value: unknown
): unknown {
  if (value == null || value === "") return null;
  const t = (dataType || "").toLowerCase();
  if (t === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1" || value === "true") return true;
    if (value === 0 || value === "0" || value === "false") return false;
    return Boolean(value);
  }
  if (t === "float" || t === "monetary" || t === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (t === "integer") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  if (t === "date") {
    const s = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  return String(value);
}

export function asBoolean(value: unknown): boolean | null {
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

export function extractCustomFieldEntries(
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
      typeof row.name === "string" ? row.name : parsed.name;
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

export function extractNamedBooleanField(
  doc: PaperlessDocument | Record<string, unknown>,
  fieldIdToName: Map<number, string>,
  exactName: string
): boolean | null {
  const want = normalizeFieldName(exactName);
  for (const entry of extractCustomFieldEntries(doc)) {
    const name =
      entry.name ||
      (entry.field > 0 ? fieldIdToName.get(entry.field) : undefined);
    if (!name || normalizeFieldName(name) !== want) continue;
    return asBoolean(entry.value);
  }
  return null;
}

export function extractNamedStringField(
  doc: PaperlessDocument | Record<string, unknown>,
  fieldIdToName: Map<number, string>,
  exactName: string
): string | null {
  const want = normalizeFieldName(exactName);
  for (const entry of extractCustomFieldEntries(doc)) {
    const name =
      entry.name ||
      (entry.field > 0 ? fieldIdToName.get(entry.field) : undefined);
    if (!name || normalizeFieldName(name) !== want) continue;
    if (entry.value == null || entry.value === "") return null;
    return String(entry.value);
  }
  return null;
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

export function slugifyBuddyTagPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "und")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function buddyCategoryTag(category: string): string {
  return `buddy:kat:${slugifyBuddyTagPart(category) || "sonstiges"}`;
}

export function buddyTripTag(tripId: number, title?: string | null): string {
  const slug = title ? slugifyBuddyTagPart(title) : "";
  return slug ? `buddy:trip:${tripId}-${slug}` : `buddy:trip:${tripId}`;
}

export function buddyLedgerTag(
  ledgerId: number,
  title?: string | null
): string {
  const slug = title ? slugifyBuddyTagPart(title) : "";
  return slug
    ? `buddy:ledger:${ledgerId}-${slug}`
    : `buddy:ledger:${ledgerId}`;
}
