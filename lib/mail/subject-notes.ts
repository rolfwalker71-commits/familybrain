import type { MailSuggestion } from "@/lib/mail/mail-action-schema";
import {
  detectCarrier,
  detectMerchant,
  detectRecipientHint,
  detectTracking,
} from "@/lib/mail/enrich-shipping-titles";

export type MailDescriptionContext = {
  from: string;
  fromName: string;
  subject: string;
  body: string;
};

function isBareSubjectParen(
  notes: string,
  subject: string | null | undefined
): boolean {
  const subj = (subject || "").trim();
  if (!subj) return false;
  const tag = `(${subj})`;
  const n = notes.trim();
  return n === tag || n === subj;
}

function aiNotesLookRich(notes: string): boolean {
  const n = notes.trim();
  if (n.length < 12) return false;
  if (/^[\(].*[\)]$/.test(n) && !n.includes(" - ")) return false;
  // Dash-separated facts or multiple lines → likely contextual
  if (n.includes(" - ") || n.includes("\n")) return true;
  return n.length >= 28;
}

function pushUnique(parts: string[], value: string | null | undefined) {
  const v = (value || "").trim();
  if (!v) return;
  const lower = v.toLowerCase();
  if (parts.some((p) => p.toLowerCase() === lower || p.toLowerCase().includes(lower))) {
    return;
  }
  if (parts.some((p) => lower.includes(p.toLowerCase()) && p.length >= 4)) {
    return;
  }
  parts.push(v);
}

/**
 * Build a contextual description for calendar/task/note from mail facts.
 * Example: «UPS Paketlieferung - irugs.ch - Trackingnummer 1Z…»
 */
export function buildSuggestionDescription(
  suggestion: MailSuggestion,
  ctx: MailDescriptionContext
): string {
  const hay = `${ctx.fromName} ${ctx.from} ${ctx.subject} ${ctx.body} ${suggestion.title} ${suggestion.reference || ""} ${suggestion.notes || ""}`;
  const carrier = detectCarrier(hay);
  const merchant = detectMerchant(hay);
  const tracking =
    suggestion.reference?.trim() || detectTracking(hay) || null;
  const recipient = detectRecipientHint(hay);
  const aiNotes = (suggestion.notes || "").trim();

  if (
    aiNotes &&
    aiNotesLookRich(aiNotes) &&
    !isBareSubjectParen(aiNotes, ctx.subject)
  ) {
    let out = aiNotes;
    if (
      tracking &&
      !out.toLowerCase().includes(tracking.toLowerCase())
    ) {
      out = `${out} - Trackingnummer ${tracking}`;
    }
    return out.slice(0, 2000);
  }

  const parts: string[] = [];

  // Prefer enriched title as lead (already carrier + merchant for shipping)
  if (suggestion.title.trim()) {
    pushUnique(parts, suggestion.title.trim());
  } else {
    pushUnique(parts, carrier);
    pushUnique(parts, merchant);
  }

  // If title lacked merchant/carrier, add them
  if (carrier && !parts[0]?.toLowerCase().includes(carrier.toLowerCase())) {
    parts.unshift(carrier);
  }
  if (
    merchant &&
    !parts.some((p) =>
      p.toLowerCase().includes(merchant.toLowerCase().split(".")[0] || merchant)
    )
  ) {
    pushUnique(parts, merchant);
  }

  if (recipient) {
    pushUnique(parts, recipient);
  }

  if (tracking) {
    const already = parts.some((p) =>
      p.toLowerCase().includes(tracking.toLowerCase())
    );
    if (!already) {
      parts.push(`Trackingnummer ${tracking}`);
    }
  }

  // Non-shipping / thin result: fall back to sender + subject gist
  if (parts.length === 0) {
    pushUnique(parts, ctx.fromName || ctx.from.split("@")[0] || null);
    const subj = (ctx.subject || "").trim();
    if (subj && subj !== "(kein Betreff)") pushUnique(parts, subj);
  } else if (
    parts.length === 1 &&
    !tracking &&
    !merchant &&
    !carrier
  ) {
    const subj = (ctx.subject || "").trim();
    if (
      subj &&
      subj !== "(kein Betreff)" &&
      !parts[0]!.toLowerCase().includes(subj.toLowerCase().slice(0, 20))
    ) {
      pushUnique(parts, subj);
    }
  }

  return parts.join(" - ").slice(0, 2000);
}

/** @deprecated Prefer buildSuggestionDescription — kept for apply-path safety. */
export function appendMailSubjectToNotes(
  notes: string | null | undefined,
  subject: string | null | undefined
): string | null {
  const base = (notes || "").trim();
  if (base) return base.slice(0, 2000);
  const subj = (subject || "").trim();
  if (!subj || subj === "(kein Betreff)") return null;
  return subj.slice(0, 2000);
}

export function enrichSuggestionNotes(
  suggestion: MailSuggestion,
  ctx: MailDescriptionContext
): MailSuggestion {
  return {
    ...suggestion,
    notes: buildSuggestionDescription(suggestion, ctx) || null,
  };
}
