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

/** AI notes worth keeping as description (not just bare subject in parens). */
function usableAiNotes(
  notes: string,
  subject: string | null | undefined
): boolean {
  const n = notes.trim();
  if (!n || n.length < 3) return false;
  if (isBareSubjectParen(n, subject)) return false;
  if (/^[\(].*[\)]$/.test(n) && !n.includes(" - ") && n.length < 40) {
    return false;
  }
  return true;
}

function pushUnique(parts: string[], value: string | null | undefined) {
  const v = (value || "").trim();
  if (!v) return;
  const lower = v.toLowerCase();
  if (
    parts.some(
      (p) => p.toLowerCase() === lower || p.toLowerCase().includes(lower)
    )
  ) {
    return;
  }
  if (parts.some((p) => lower.includes(p.toLowerCase()) && p.length >= 4)) {
    return;
  }
  parts.push(v);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * For calendar events: strip location / time / duration — those belong on the event fields.
 */
export function scrubEventScheduleFromNotes(
  notes: string | null | undefined,
  suggestion: MailSuggestion
): string | null {
  if (suggestion.kind !== "event") {
    const base = (notes || "").trim();
    return base || null;
  }
  let t = (notes || "").trim();
  if (!t) return null;

  const title = suggestion.title.trim();
  const loc = suggestion.location?.trim();
  if (loc && loc.length >= 3) {
    t = t.replace(new RegExp(escapeRegExp(loc), "gi"), "");
  }

  // Phrases first (before stripping bare HH:mm leaves «ab Uhr»)
  t = t.replace(
    /\b(ab|um|von|bis|gegen)\s+\d{1,2}([:.]\d{2})?\s*(uhr)?\b/gi,
    ""
  );
  t = t.replace(
    /\bzwischen\s+\d{1,2}([:.]\d{2})?\s*(uhr)?\s*(und|bis|-|–)\s*\d{1,2}([:.]\d{2})?\s*(uhr)?\b/gi,
    ""
  );
  t = t.replace(
    /\bdauer\s*(ca\.?\s*)?\d+([.,]\d+)?\s*(stunden|std\.?|minuten|min\.?)\b/gi,
    ""
  );
  t = t.replace(/\bca\.\s*\d+\s*(stunden|std\.?|minuten|min\.?)\b/gi, "");
  t = t.replace(/\b\d{1,2}([:.]\d{2})?\s*uhr\b/gi, "");

  for (const hm of [suggestion.startTime, suggestion.endTime]) {
    if (!hm) continue;
    t = t.replace(new RegExp(`\\b${escapeRegExp(hm)}\\b`, "g"), "");
    const loose = hm.replace(/^0/, "");
    if (loose !== hm) {
      t = t.replace(new RegExp(`\\b${escapeRegExp(loose)}\\b`, "g"), "");
    }
  }

  t = t.replace(/\b(ab|um|von|bis|gegen)\s*uhr\b/gi, "");
  // CH address: street + PLZ + place
  t = t.replace(
    /\b[A-Za-zÄÖÜäöü][\wÄÖÜäöü.'\- ]*\s+\d+[a-zA-Z]?\s*,\s*\d{4}\s+[A-Za-zÄÖÜäöü][\wÄÖÜäöü\- ]+/gi,
    ""
  );
  t = t.replace(/\b\d{4}\s+[A-Za-zÄÖÜäöü][\wÄÖÜäöü\- ]{2,40}\b/gi, "");

  t = t
    .split(/\s*[-–—]\s*/)
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      if (loc && p.toLowerCase() === loc.toLowerCase()) return false;
      if (/^(ort|zeit|dauer|termin|uhrzeit|ab|um|von|bis)$/i.test(p)) {
        return false;
      }
      return true;
    })
    .join(" - ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Only title left → nothing extra for the description field
  if (title && t.toLowerCase() === title.toLowerCase()) return null;

  return t || null;
}

/**
 * Build a contextual description for calendar/task/note from mail facts.
 * Example shipping: «UPS Paketlieferung - irugs.ch - Trackingnummer 1Z…»
 * Prefer as much useful context as possible (tracking, prep, people).
 * Events: strip location/time/duration — those belong on event fields.
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

  let out = "";

  if (usableAiNotes(aiNotes, ctx.subject)) {
    out = aiNotes;
  } else {
    const parts: string[] = [];

    if (suggestion.title.trim()) {
      pushUnique(parts, suggestion.title.trim());
    } else {
      pushUnique(parts, carrier);
      pushUnique(parts, merchant);
    }

    if (carrier && !parts[0]?.toLowerCase().includes(carrier.toLowerCase())) {
      parts.unshift(carrier);
    }
    if (
      merchant &&
      !parts.some((p) =>
        p
          .toLowerCase()
          .includes(merchant.toLowerCase().split(".")[0] || merchant)
      )
    ) {
      pushUnique(parts, merchant);
    }

    if (recipient) {
      pushUnique(parts, recipient);
    }

    const fromHint = (ctx.fromName || "").trim();
    if (
      fromHint &&
      fromHint.length >= 2 &&
      !suggestion.title.toLowerCase().includes(fromHint.toLowerCase())
    ) {
      pushUnique(parts, fromHint);
    }

    if (parts.length === 0) {
      pushUnique(parts, ctx.fromName || ctx.from.split("@")[0] || null);
      const subj = (ctx.subject || "").trim();
      if (subj && subj !== "(kein Betreff)") pushUnique(parts, subj);
    } else if (parts.length === 1 && !tracking && !merchant && !carrier) {
      const subj = (ctx.subject || "").trim();
      if (
        subj &&
        subj !== "(kein Betreff)" &&
        !parts[0]!.toLowerCase().includes(subj.toLowerCase().slice(0, 20))
      ) {
        pushUnique(parts, subj);
      }
    }

    out = parts.join(" - ");
  }

  if (tracking && !out.toLowerCase().includes(tracking.toLowerCase())) {
    out = out
      ? `${out} - Trackingnummer ${tracking}`
      : `Trackingnummer ${tracking}`;
  }

  const scrubbed = scrubEventScheduleFromNotes(out, suggestion);
  return (scrubbed || "").slice(0, 2000);
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
  const notes = buildSuggestionDescription(suggestion, ctx);
  return {
    ...suggestion,
    notes: notes || null,
  };
}
