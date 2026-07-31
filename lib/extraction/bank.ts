/** Bank / credit-card statement helpers (Steuern grouping + summary identity). */

const BANK_DOC_RE =
  /kontoauszug|bankauszug|bankbeleg|depotauszug|saldoausweis|verm[oö]gensausweis|zins-?\s*und\s*kapitalausweis|zinsausweis|kapitalausweis|account\s*statement|bank\s*statement|portfolio\s*statement|verm[oö]gensaufstellung/i;

const CREDIT_CARD_DOC_RE =
  /kreditkarten?abrechnung|kreditkarten?auszug|kartenabrechnung|kartenauszug|credit\s*card\s*(?:statement|bill)|visa[-\s]?abrechnung|mastercard[-\s]?abrechnung|amex[-\s]?abrechnung|american\s*express/i;

/** Local account numbers (not IBAN): 0020-16608-4A, masked ****1234, etc. */
const LOCAL_ACCOUNT_RE =
  /\b((?:\d{2,6}[.\-]\d{2,8}(?:[.\-]\d{1,6})?[A-Za-z0-9]?)|(?:\*{2,}\d{3,6}))\b/gi;

/** Labeled Kontonummer / Kundenkonto (prefer over free-form guesses). */
const LABELED_ACCOUNT_RE =
  /(?:konto(?:nummer|nr\.?|n[rr]\.?)|kundenkonto|account(?:\s*no\.?|\s*number)?|a\/c)\s*[:#.]?\s*([A-Z0-9][A-Z0-9.\-\/\s]{3,28})/gi;

/** IBAN (CH / international), optional spaces between groups. */
const IBAN_RE =
  /\b([A-Z]{2}\d{2}(?:[\s]?[A-Z0-9]{4}){2,7}(?:[\s]?[A-Z0-9]{1,4})?)\b/gi;

/** Masked or spaced card numbers; keep last 4 when masked. */
const CARD_NUMBER_RE =
  /(?:(?:karten(?:nummer|nr\.?)|card\s*(?:no\.?|number)|visa|mastercard|amex)\s*[:#.]?\s*)?((?:\*{4}|X{4}|x{4}|\d{4})[\s\-]*(?:\*{4}|X{4}|x{4}|\d{4})[\s\-]*(?:\*{4}|X{4}|x{4}|\d{4})[\s\-]*(?:\d{4}))/gi;

export function looksLikeBankDocument(text: string): boolean {
  return BANK_DOC_RE.test(text || "");
}

export function looksLikeCreditCardStatement(text: string): boolean {
  return CREDIT_CARD_DOC_RE.test(text || "");
}

/** Bank or card statements that should carry (account/card) in the summary. */
export function looksLikeAccountStatement(text: string): boolean {
  return looksLikeBankDocument(text) || looksLikeCreditCardStatement(text);
}

export function looksLikeIban(raw: string | null | undefined): boolean {
  const compact = (raw || "").replace(/[\s._\-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
  return compact.length >= 15 && compact.length <= 34;
}

/** Swiss-style calendar date (rejects as fake «Kontonummer»). */
export function looksLikeDateToken(raw: string | null | undefined): boolean {
  const t = (raw || "").trim();
  if (!t) return false;
  if (
    /^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}$/.test(t) ||
    /^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(t) ||
    /^\d{1,2}[.\-/]\d{4}$/.test(t)
  ) {
    return true;
  }
  const digits = t.replace(/\D/g, "");
  // 01062026 / 20260601 style
  if (/^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(19|20)\d{2}$/.test(digits)) {
    return true;
  }
  if (/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(digits)) {
    return true;
  }
  return false;
}

/** Format IBAN with spaces every 4 chars for the summary line. */
export function formatIbanDisplay(raw: string): string {
  const compact = raw.replace(/[\s._\-]/g, "").toUpperCase();
  if (!looksLikeIban(compact)) return raw.trim();
  return compact.replace(/(.{4})/g, "$1 ").trim();
}

/** Display card as •••• 1234 when we only trust the last four. */
export function formatCardDisplay(raw: string): string {
  const compact = raw.replace(/[\s\-]/g, "").toUpperCase();
  const last4 = compact.replace(/\D/g, "").slice(-4);
  if (last4.length === 4 && /[*\dX]{12,}/i.test(compact)) {
    return `•••• ${last4}`;
  }
  if (/^\d{4}$/.test(compact)) return `•••• ${compact}`;
  return raw.replace(/\s+/g, " ").trim();
}

export function normalizeAccountKey(
  raw: string | null | undefined
): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const key = t.replace(/[\s._\-]/g, "").toUpperCase();
  return key.length >= 4 ? key : null;
}

export function formatBankAccountHeading(input: {
  bankName?: string | null;
  accountNumber?: string | null;
}): string {
  const bank = input.bankName?.trim() || null;
  const acctRaw = input.accountNumber?.trim() || null;
  const acct = acctRaw
    ? looksLikeIban(acctRaw)
      ? formatIbanDisplay(acctRaw)
      : /[•*]{2,}|\bxxxx\b/i.test(acctRaw) || /^\d{4}$/.test(acctRaw.replace(/\D/g, ""))
        ? formatCardDisplay(acctRaw)
        : acctRaw
    : null;
  if (bank && acct) return `${bank} · ${acct}`;
  if (acct) {
    if (looksLikeIban(acctRaw)) return `IBAN ${acct}`;
    if (/[•*]/.test(acct) || /karte|card/i.test(acctRaw || "")) {
      return `Karte ${acct}`;
    }
    return `Konto ${acct}`;
  }
  if (bank) return bank;
  return "Bankbeleg ohne Kontonummer";
}

function haystack(input: {
  title?: string | null;
  shortSummary?: string | null;
  content?: string | null;
}): string {
  return normalizeOcrText(
    [input.title, input.shortSummary, (input.content || "").slice(0, 12000)]
      .filter(Boolean)
      .join("\n")
  );
}

function isPlausibleLocalAccount(cand: string): boolean {
  if (!cand || looksLikeIban(cand) || looksLikeDateToken(cand)) return false;
  const digits = cand.replace(/\D/g, "");
  // Need a real digit run — reject prose like «Mitglieder Privatkonto».
  if (digits.length < 4) return false;
  if (digits.length < 6 && !/[A-Za-z*]/.test(cand)) return false;
  if (/^(19|20)\d{2}$/.test(digits)) return false;
  // Pure amounts / years
  if (/^\d{1,5}([.,]\d{2})?$/.test(cand.trim())) return false;
  // Too many letters → product/account-type label, not a number
  const letters = (cand.match(/[A-Za-zÄÖÜäöü]/g) || []).length;
  if (letters >= 8 && digits.length < 6) return false;
  return true;
}

function sanitizeAiAccount(
  raw: string | null | undefined
): string | null {
  const t = (raw || "").trim();
  if (!t || t.length < 4) return null;
  if (looksLikeDateToken(t)) return null;
  if (looksLikeIban(t)) return formatIbanDisplay(t);
  if (isPlausibleLocalAccount(t)) return t;
  // Masked card or last-4 from AI
  if (/[*X]{2,}|\d{4}/i.test(t) && t.replace(/\D/g, "").length >= 4) {
    return formatCardDisplay(t);
  }
  return null;
}

/** Collapse long branch names in titles/summaries (e.g. Raiffeisenbank Cham-Steinhausen → Raiffeisen). */
export function shortenInstitutionName(text: string): string {
  return (text || "")
    .replace(/Raiffeisenbank\s+Cham[-\s]?Steinhausen/gi, "Raiffeisen")
    .replace(/Raiffeisenbank(?:\s+[A-Za-zÄÖÜäöüéèê.\-]+)+/gi, "Raiffeisen")
    .replace(/\bRaiffeisenbank\b/gi, "Raiffeisen");
}

/** Normalize OCR quirks (nbsp etc.) before IBAN / account regexes. */
function normalizeOcrText(text: string): string {
  return (text || "").replace(/[\u00A0\u202F\u2007\u2008\u2009\u200A]/g, " ");
}

/** First labeled Kontonummer in text. */
export function extractLabeledAccountNumber(text: string): string | null {
  for (const m of (text || "").matchAll(LABELED_ACCOUNT_RE)) {
    let cand = (m[1] || "").replace(/\s+/g, " ").trim();
    cand = cand.replace(/[.,;:]+$/, "").trim();
    // Stop at next label word
    cand = cand.split(/\s{2,}|\s(?=CHF|EUR|USD|IBAN|Konto)/i)[0]?.trim() || cand;
    if (!isPlausibleLocalAccount(cand)) continue;
    if (looksLikeIban(cand)) return formatIbanDisplay(cand);
    return cand;
  }
  return null;
}

/** First plausible local Kontonummer in text (excludes IBAN + dates). */
export function extractLocalAccountNumber(text: string): string | null {
  for (const m of (text || "").matchAll(LOCAL_ACCOUNT_RE)) {
    const cand = (m[1] || "").replace(/\s+/g, " ").trim();
    if (!isPlausibleLocalAccount(cand)) continue;
    return cand;
  }
  return null;
}

/** First IBAN in text, normalized for display. */
export function extractIban(text: string): string | null {
  // Prefer IBAN after an «IBAN» label
  const labeled =
    /IBAN\s*[:#.]?\s*([A-Z]{2}\d{2}(?:[\s]?[A-Z0-9]{4}){2,7}(?:[\s]?[A-Z0-9]{1,4})?)/gi;
  for (const m of (text || "").matchAll(labeled)) {
    const cand = (m[1] || "").replace(/\s+/g, "").toUpperCase();
    if (looksLikeIban(cand)) return formatIbanDisplay(cand);
  }
  for (const m of (text || "").matchAll(IBAN_RE)) {
    const cand = (m[1] || "").replace(/\s+/g, "").toUpperCase();
    if (!looksLikeIban(cand)) continue;
    return formatIbanDisplay(cand);
  }
  return null;
}

/** Credit-card number (prefer masked •••• last4). */
export function extractCardNumber(text: string): string | null {
  for (const m of (text || "").matchAll(CARD_NUMBER_RE)) {
    const cand = (m[1] || "").trim();
    if (!cand) continue;
    const digits = cand.replace(/\D/g, "");
    if (digits.length < 4) continue;
    // Avoid matching pure IBANs / long account strings without card shape
    if (digits.length >= 15 && digits.length <= 34 && !/[*X]/i.test(cand)) {
      continue;
    }
    return formatCardDisplay(cand);
  }
  // Labeled last four only: Kartennummer … 1234
  const last4 = /(?:karten(?:nummer|nr\.?)|card\s*(?:ending|no\.?))\s*[:#.]?\s*[*\dX\s\-]{0,24}?(\d{4})\b/gi;
  for (const m of (text || "").matchAll(last4)) {
    const d = m[1];
    if (d && /^\d{4}$/.test(d)) return `•••• ${d}`;
  }
  return null;
}

/**
 * Prefer Kontonummer; else card number; else IBAN.
 * OCR beats AI prose (AI often invents «Mitglieder Privatkonto» as account_number).
 * Stored in account_number and appended to short_summary as «(…)».
 */
export function resolveAccountNumber(input: {
  accountNumber?: string | null;
  title?: string | null;
  shortSummary?: string | null;
  content?: string | null;
}): string | null {
  const hay = haystack(input);
  const labeled = extractLabeledAccountNumber(hay);
  if (labeled) return labeled;

  const local = extractLocalAccountNumber(hay);
  if (local) return local;

  const card = extractCardNumber(hay);
  if (card) return card;

  const iban = extractIban(hay);
  if (iban) return iban;

  return sanitizeAiAccount(input.accountNumber);
}

export function resolveBankName(input: {
  bankName?: string | null;
  correspondent?: string | null;
}): string | null {
  const fromAi = input.bankName?.trim();
  if (fromAi) return shortenInstitutionName(fromAi);
  const corr = input.correspondent?.trim();
  if (
    corr &&
    /bank|credit\s*suisse|ubs|raiffeisen|postfinance|zkb|cs\b|swissquote|julius\s*bär|julius\s*baer|visa|mastercard|amex|american\s*express|kartenzentrum|cembra|bonus\s*card/i.test(
      corr
    )
  ) {
    return shortenInstitutionName(corr);
  }
  return null;
}
