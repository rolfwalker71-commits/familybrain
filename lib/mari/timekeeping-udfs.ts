/** USER-Felder der MARI-Zeiterfassungszeile (MPPROJEKTBUCHUNGSERFASSUNG / clsImportLine). */

export const TIMEKEEPING_UDF_INT_BEMERKUNG = "USER_ND_Int_Bemerkung_Verr";
export const TIMEKEEPING_UDF_BEGRUENDUNG = "USER_Begruendung";

/**
 * ROWSOURCE aus MPSYSUSERFIELDS: Value;Label;Value;Label;…
 * (Begründung ohne Label → Value als Label)
 */
export const TIMEKEEPING_INT_BEMERKUNG_OPTIONS: {
  value: string;
  label: string;
}[] = [
  { value: "Umbuchen", label: "Umbuchen ?" },
  { value: "Verrechnen", label: "Verrechnen ?" },
  { value: "Rueckfrage", label: "Rückfragen vor Verrechnung" },
  { value: "Begründung", label: "Begründung" },
];

const MEMO_UDF_START = "⸨BuddyUDF⸩";
const MEMO_UDF_END = "⸨/BuddyUDF⸩";

export type TimekeepingUdfFields = {
  /** USER_ND_Int_Bemerkung_Verr */
  internalRemarkVerr: string | null;
  /** USER_Begruendung — Grund für Nullerstunden */
  zeroHoursReason: string | null;
};

export function labelForInternalRemarkVerr(value: string | null | undefined): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  return (
    TIMEKEEPING_INT_BEMERKUNG_OPTIONS.find((o) => o.value === v)?.label || v
  );
}

/** Entfernt den Buddy-UDF-Block aus dem Memo-Anzeige-/Edit-Text. */
export function stripTimekeepingUdfFromMemo(memo: string | null | undefined): string {
  const raw = memo || "";
  const start = raw.indexOf(MEMO_UDF_START);
  if (start === -1) return raw.trim();
  const end = raw.indexOf(MEMO_UDF_END, start);
  if (end === -1) return raw.slice(0, start).trim();
  return `${raw.slice(0, start)}${raw.slice(end + MEMO_UDF_END.length)}`
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseTimekeepingUdfFromMemo(
  memo: string | null | undefined
): TimekeepingUdfFields {
  const raw = memo || "";
  const start = raw.indexOf(MEMO_UDF_START);
  const end = raw.indexOf(MEMO_UDF_END, start);
  if (start === -1 || end === -1) {
    return { internalRemarkVerr: null, zeroHoursReason: null };
  }
  const block = raw.slice(start + MEMO_UDF_START.length, end);
  let internalRemarkVerr: string | null = null;
  let zeroHoursReason: string | null = null;
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (t.startsWith("InterneBemerkung=")) {
      internalRemarkVerr = t.slice("InterneBemerkung=".length).trim() || null;
    } else if (t.startsWith("Nullerstunden=")) {
      zeroHoursReason = decodeUdfLine(t.slice("Nullerstunden=".length));
    }
  }
  return { internalRemarkVerr, zeroHoursReason };
}

function encodeUdfLine(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n/g, "\\n");
}

function decodeUdfLine(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  return t.replace(/\\n/g, "\n");
}

/** Hängt/aktualisiert den Buddy-UDF-Block am Memo (Fallback, weil MARI REST UDFs oft nicht speichert). */
export function mergeTimekeepingUdfIntoMemo(
  memo: string | null | undefined,
  udf: TimekeepingUdfFields
): string | null {
  const base = stripTimekeepingUdfFromMemo(memo);
  const remark = (udf.internalRemarkVerr || "").trim();
  const reason = (udf.zeroHoursReason || "").trim();
  if (!remark && !reason) return base || null;
  const block = [
    MEMO_UDF_START,
    `InterneBemerkung=${remark}`,
    `Nullerstunden=${encodeUdfLine(reason)}`,
    MEMO_UDF_END,
  ].join("\n");
  return base ? `${base}\n\n${block}` : block;
}

export function buildTimekeepingUserDefinedFieldValues(
  udf: TimekeepingUdfFields
): Record<string, string> | null {
  const remark = (udf.internalRemarkVerr || "").trim();
  const reason = (udf.zeroHoursReason || "").trim();
  if (!remark && !reason) return null;
  const out: Record<string, string> = {};
  if (remark) out[TIMEKEEPING_UDF_INT_BEMERKUNG] = remark;
  if (reason) out[TIMEKEEPING_UDF_BEGRUENDUNG] = reason;
  return out;
}
