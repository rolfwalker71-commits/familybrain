import type { MailAnalysis, MailSuggestion } from "@/lib/mail/mail-action-schema";

/** Keywords that warrant an AI look (parcel, appointment, bill, travel, …). */
const INTEREST_RE =
  /\b(ups|dhl|fedex|swiss\s*post|die\s*post|postch|sendung|paket|parcel|tracking|zustellung|lieferung|abholung|pickup|versand|shipment|appointment|meeting|einladung|invite|calendar|kalender|zoom|teams|meet\.google|rechnung|invoice|zahlung|payment|fällig|frist|reminder|mahnung|flug|flight|booking|buchung|check-?in|hotel|reservation|versicherung|kündigung|vertrag|arzt|spital|hospital|impfung|zahnarzt)\b|termin\w*/i;

const SKIP_RE =
  /\b(newsletter|unsubscribe|abmelden|werbung|promotion|sale\s*%|black\s*friday|marketing|digest|weekly\s*roundup)\b/i;

/**
 * Cheap gate before OpenAI. True → run AI (or at least store a skipped row if false).
 * Soft sender prefs: applied domains lean true; heavily dismissed lean false.
 */
export function shouldAnalyzeMail(
  input: {
    from: string;
    fromName: string;
    subject: string;
    snippet: string;
  },
  prefs?: { appliedCount: number; dismissedCount: number } | null
): boolean {
  const subject = (input.subject || "").trim();
  if (/^(wg|aw|fwd?|fw)\s*:/i.test(subject)) return true;

  const hay = `${input.fromName} ${input.from} ${subject} ${input.snippet}`;
  if (INTEREST_RE.test(hay)) return true;

  if (
    prefs &&
    prefs.dismissedCount >= 2 &&
    prefs.appliedCount === 0 &&
    SKIP_RE.test(hay)
  ) {
    return false;
  }
  if (prefs && prefs.appliedCount >= 1) return true;
  if (
    prefs &&
    prefs.dismissedCount >= 2 &&
    prefs.appliedCount === 0 &&
    !INTEREST_RE.test(hay)
  ) {
    return false;
  }

  if (SKIP_RE.test(hay)) return false;
  // Unknown: still analyze unread-looking short operational mails lightly —
  // prefer skip to save tokens unless subject looks actionable.
  if (
    /\b(wichtig|action\s*required|bitte|reminder|bestätigung|confirmation|buchung|status)\b/i.test(
      hay
    )
  ) {
    return true;
  }
  return false;
}

export type MailAnalysisStatus =
  | "pending_triage"
  | "analyzed"
  | "applied"
  | "dismissed"
  | "skipped"
  | "error";

export type MailAnalysisChip =
  | "suggestion"
  | "analyzed"
  | "none"
  | "skipped"
  | "error"
  | "applied"
  | "dismissed"
  | "pending";

export function chipForStatus(
  status: MailAnalysisStatus | null | undefined,
  suggestionCount = 0
): MailAnalysisChip {
  if (!status) return "pending";
  if (status === "pending_triage" && suggestionCount > 0) return "suggestion";
  if (status === "applied") return "applied";
  if (status === "dismissed") return "dismissed";
  if (status === "skipped") return "skipped";
  if (status === "error") return "error";
  // analyzed or pending_triage without suggestions → AI ran, nothing to extract
  if (status === "analyzed" || status === "pending_triage") return "none";
  return "pending";
}

export function chipLabelDe(chip: MailAnalysisChip | null | undefined): string {
  if (chip === "suggestion") return "Zur Triage";
  if (chip === "none") return "Kein Extrakt";
  if (chip === "analyzed") return "Analysiert";
  if (chip === "skipped") return "Übersprungen";
  if (chip === "error") return "Fehler";
  if (chip === "applied") return "Übernommen";
  if (chip === "dismissed") return "Verworfen";
  if (chip === "pending") return "Ausstehend";
  return "Ausstehend";
}

export function resolveStatusFromAnalysis(
  analysis: MailAnalysis
): MailAnalysisStatus {
  if (analysis.suggestions.length > 0) return "pending_triage";
  return "analyzed";
}

export type StoredMailAnalysis = {
  userId: number;
  messageId: string;
  threadId: string | null;
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  snippet: string | null;
  status: MailAnalysisStatus;
  relevance: string | null;
  summary: string | null;
  analysis: MailAnalysis | null;
  suggestionCount: number;
  error: string | null;
  analyzedAt: string;
  updatedAt: string;
  chip: MailAnalysisChip;
};

export function parseStoredSuggestions(
  analysis: MailAnalysis | null
): MailSuggestion[] {
  return analysis?.suggestions || [];
}
