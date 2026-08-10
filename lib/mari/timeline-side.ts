/** Client-safe timeline side helpers (no Node/SQLite imports). */

export type MariTimelineKind =
  | "inbound"
  | "reply"
  | "customer"
  | "system"
  | "note"
  | "change"
  | "attachment";

/** Wer hat den Beitrag geschrieben / geliefert. */
export type MariTimelineSide = "support" | "customer" | "system" | "unknown";

/**
 * Seite des Beitrags für AI/UI.
 * Typ 1 Antwort / 5 Notiz = Support (wir); 3 Eingang / 8 Kunde = Kunde;
 * 4 System / ChangeLog = System. EmployeeNumber M… stützt Support.
 */
export function resolveTimelineSide(params: {
  kind: MariTimelineKind;
  posType?: number | null;
  actor?: string | null;
  internalOnly?: boolean;
}): MariTimelineSide {
  const { kind, actor, internalOnly } = params;
  if (kind === "change" || kind === "system") return "system";
  if (kind === "reply" || kind === "note") return "support";
  if (kind === "customer" || kind === "inbound") return "customer";
  if (kind === "attachment") {
    const pos = params.posType;
    if (pos === 1 || pos === 5) return "support";
    if (pos === 3 || pos === 8) return "customer";
    if (pos === 4) return "system";
  }
  if (internalOnly) return "support";
  if (actor && /^M\d+/i.test(actor.trim())) return "support";
  return "unknown";
}

export function timelineSideLabel(side: MariTimelineSide): string {
  switch (side) {
    case "support":
      return "Support (wir)";
    case "customer":
      return "Kunde";
    case "system":
      return "System";
    default:
      return "Unklar";
  }
}

/**
 * Mail-Platzhalter ohne echten Inhalt — oft nur Träger für Anhänge.
 * Texte mit «Aus E-Mail gesendet» + echtem Body danach sind KEINE Stubs.
 */
export function isMariMailStubText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const withoutPrefix = t
    .replace(/^Aus E-Mail gesendet\.?\s*/i, "")
    .trim();
  if (!withoutPrefix) return true;
  if (/^Aus E-Mail gesendet/i.test(t) && withoutPrefix.length < 40) {
    return true;
  }
  return false;
}
