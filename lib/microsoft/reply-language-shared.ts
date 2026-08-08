export type ReplyLang = "de" | "en";

/** Heuristik: DE vs EN anhand typischer Phrasen / Wörter. */
export function detectReplyLanguage(text: string): ReplyLang {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return "de";
  const dePatterns =
    /\b(sehr geehrte|geehrte[rn]?|grüsse|grüße|freundliche|mit freundlichen|anbei|bezüglich|bitte|danke|folgende|könnten|würden|unserer|ihnen|sie haben|antwort|rückmeldung)\b/g;
  const enPatterns =
    /\b(dear|hi |hello|regards|best regards|kind regards|please|thanks|thank you|regarding|attached|could you|would you|looking forward|as discussed|fyi)\b/g;
  const deHits = (t.match(dePatterns) || []).length;
  const enHits = (t.match(enPatterns) || []).length;
  if (enHits === 0 && deHits === 0) {
    if (/[äöüÄÖÜß]/.test(text)) return "de";
    if (/\b(the|and|for|with|your|our|we|you)\b/i.test(t)) return "en";
    return "de";
  }
  return enHits > deHits ? "en" : "de";
}

/** Betreff-Präfix an Sprache anpassen (Re: / AW:). */
export function normalizeReplySubject(
  subject: string,
  lang: ReplyLang
): string {
  const raw = (subject || "").trim();
  if (!raw) return lang === "en" ? "Re:" : "AW:";
  const stripped = raw.replace(/^(re|aw|wg|fwd|fw)\s*:\s*/i, "").trim();
  const prefix = lang === "en" ? "Re:" : "AW:";
  return `${prefix} ${stripped}`;
}
