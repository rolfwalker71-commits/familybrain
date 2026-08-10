export type ReplyLang = "de" | "en";

/** Anrede im Mail-/Ticket-Verlauf: per Du vs. formell (Sie / Name+Titel). */
export type ReplyAddressForm = "du" | "formal" | "unknown";

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

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const m = text.match(new RegExp(re.source, flags));
  return m ? m.length : 0;
}

/** Roh-Score Du vs. formell aus einem Textblock (Anrede + Pronomen). */
export function scoreReplyAddressForm(text: string): {
  du: number;
  formal: number;
} {
  const raw = text || "";
  if (!raw.trim()) return { du: 0, formal: 0 };
  const t = raw.toLowerCase();

  let du = 0;
  let formal = 0;

  // DE Anrede
  if (
    /(?:^|\n)\s*(hallo|hi|hey)\s+[a-zäöü]/i.test(raw) ||
    /(?:^|\n)\s*(hallo|hi|hey)\s*[,\n]/i.test(raw)
  ) {
    du += 3;
  }
  if (
    /(?:^|\n)\s*sehr\s+geehrte/i.test(raw) ||
    /(?:^|\n)\s*guten\s+tag\s+(herr|frau)\b/i.test(raw) ||
    /(?:^|\n)\s*(herr|frau)\s+[a-zäöü]/i.test(raw)
  ) {
    formal += 4;
  }

  // DE Pronomen (formelles «Sie» grossgeschrieben)
  du += countMatches(t, /\b(du|dir|dich|dein|deine|deinen|deinem|deiner|deines)\b/);
  formal += countMatches(raw, /\bSie\b/);
  formal += countMatches(raw, /\b(Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/);
  // «sie haben» kleingeschrieben oft formell falsch — eher formaler Kontext
  formal += countMatches(t, /\bsie haben\b/);

  // EN
  if (/(?:^|\n)\s*(hi|hey)\s+[a-z]/i.test(raw) || /(?:^|\n)\s*(hi|hey)\s*[,\n!]/i.test(raw)) {
    du += 3;
  }
  if (/(?:^|\n)\s*dear\s+(mr|mrs|ms|sir|madam)\b/i.test(raw)) {
    formal += 4;
  }
  if (/(?:^|\n)\s*dear\s+[a-z]+(\s+[a-z]+)?\s*[,]/i.test(raw) && !/(?:^|\n)\s*dear\s+(mr|mrs|ms|sir|madam)\b/i.test(raw)) {
    // "Dear Andrej," oft halbformell — leicht formal, wenn Nachname/Titel fehlt eher du-nah
    du += 1;
  }
  if (/\byours\s+sincerely\b/i.test(t) || /\bkind\s+regards\b/i.test(t)) {
    formal += 1;
  }
  if (/\bcheers\b/i.test(t) || /\bbest\b/i.test(t) && /\b(hi|hey)\b/i.test(t)) {
    du += 1;
  }

  return { du, formal };
}

/**
 * Anrede-Muster aus Text. Unsere bisherigen Antworten stärker gewichten
 * (Sent / Support), weil Buddy denselben Ton treffen soll.
 */
export function detectReplyAddressForm(
  texts: string | string[],
  options?: { ourTexts?: string[] }
): ReplyAddressForm {
  const parts = Array.isArray(texts) ? texts : [texts];
  let du = 0;
  let formal = 0;
  for (const p of parts) {
    const s = scoreReplyAddressForm(p);
    du += s.du;
    formal += s.formal;
  }
  for (const p of options?.ourTexts || []) {
    const s = scoreReplyAddressForm(p);
    du += s.du * 2;
    formal += s.formal * 2;
  }
  if (du === 0 && formal === 0) return "unknown";
  if (du === formal) return "unknown";
  return du > formal ? "du" : "formal";
}

/** Kurzer Prompt-Hinweis für Reply-Generierung / Übersetzung. */
export function replyAddressFormInstruction(
  form: ReplyAddressForm,
  lang: ReplyLang = "de"
): string {
  if (lang === "en") {
    if (form === "du") {
      return `ADDRESS FORM: informal (first-name / Hi). Match the thread — do not switch to Dear Mr/Ms.`;
    }
    if (form === "formal") {
      return `ADDRESS FORM: formal (Dear Mr/Ms / title + surname if known). No casual Hi/Hey.`;
    }
    return `ADDRESS FORM: unknown — mirror the latest outbound tone in the thread; if none, use formal business English.`;
  }
  if (form === "du") {
    return `ANREDE: per Du (Hallo + Vorname wie im Verlauf). Konsequent du/dir/dein — kein Sie/Ihnen, keine «Sehr geehrte/r Herr/Frau».`;
  }
  if (form === "formal") {
    return `ANREDE: formell (Sehr geehrte/r / Guten Tag Herr/Frau + Name wie im Verlauf). Konsequent Sie/Ihnen/Ihr — kein Duzen.`;
  }
  return `ANREDE: unklar — Ton der letzten eigenen (Support-)Antwort im Verlauf spiegeln; sonst formell (Sie). Nie Du und Sie mischen.`;
}
