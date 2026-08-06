/** Bank / credit-card statement helpers (Steuern grouping + summary identity). */

const BANK_DOC_RE =
  /kontoauszug|bankauszug|bankbeleg|depotauszug|saldoausweis|verm[oö]gensausweis|zins-?\s*und\s*kapitalausweis|zinsausweis|kapitalausweis|account\s*statement|bank\s*statement|portfolio\s*statement|verm[oö]gensaufstellung/i;

const CREDIT_CARD_DOC_RE =
  /kreditkarten?abrechnung|kreditkarten?auszug|kreditkarten?rechnung|kartenabrechnung|kartenauszug|kartenrechnung|credit\s*card\s*(?:statement|bill)|visa[-\s]?(?:abrechnung|rechnung)|mastercard[-\s]?(?:abrechnung|rechnung)|amex[-\s]?(?:abrechnung|rechnung)|american\s*express/i;

/** Swiss / common card issuers (statement senders — not merchants). */
const CREDIT_CARD_ISSUER_RE =
  /swisscard|aecs|migros\s*bank|cumulus|cembra|bonus\s*card|viseca|corner(?:card)?|ubs\s*(?:visa|mastercard|karte)|credit\s*suisse\s*(?:visa|mastercard)|postfinance\s*(?:visa|mastercard|karte)|american\s*express|amex|kartenzentrum/i;

/**
 * Vendor invoices / bookings that mention a card as payment method only —
 * must not appear as top-level «Abrechnungen» in the Kreditkarten view.
 */
const CREDIT_CARD_FALSE_POSITIVE_RE =
  /buchungsbest(?:ä|ae)tigung|booking\s*confirmation|reservierungsbest(?:ä|ae)tigung|hotel\s*best(?:ä|ae)tigung|\brechnung\b|\binvoice\b|copilot|saas|abonnement|subscription/i;

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

export function looksLikeCreditCardIssuer(text: string): boolean {
  return CREDIT_CARD_ISSUER_RE.test(text || "");
}

/**
 * Gate for the Kreditkarten overview: keep monthly issuer statements,
 * drop miscategorized invoices/bookings that only mention a card.
 */
export function isCreditCardOverviewDocument(input: {
  title?: string | null;
  summary?: string | null;
  correspondentName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  lineItemCount?: number;
}): boolean {
  const hay = [
    input.title,
    input.summary,
    input.correspondentName,
    input.bankName,
  ]
    .filter(Boolean)
    .join("\n");
  const lineItems = Math.max(0, Number(input.lineItemCount) || 0);
  const hasAccount = Boolean(
    input.accountNumber && String(input.accountNumber).trim()
  );

  // Strong positive: classic statement wording
  if (looksLikeCreditCardStatement(hay)) return true;

  // Known issuer + card/account or enough extracted charges
  if (looksLikeCreditCardIssuer(hay)) {
    if (hasAccount || lineItems >= 3) return true;
  }

  // Many charge lines usually means a real statement extract succeeded
  if (lineItems >= 8 && (hasAccount || looksLikeCreditCardIssuer(hay))) {
    return true;
  }

  // Clear false positives without statement keywords
  if (CREDIT_CARD_FALSE_POSITIVE_RE.test(hay)) {
    return false;
  }

  // Remaining category=Kreditkarten docs: keep if we have a card/account key
  if (hasAccount && lineItems >= 1) return true;

  // Soft keep: issuer name alone with at least one charge
  if (looksLikeCreditCardIssuer(hay) && lineItems >= 1) return true;

  // Otherwise do not trust the category alone
  return false;
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

/**
 * Normalize IBAN for display; recover missing CH/country prefix
 * (AI often returns 7880808002250092277 instead of CH78…).
 */
export function recoverIbanDisplay(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  const compact = raw.replace(/[\s._\-]/g, "").toUpperCase();
  if (looksLikeIban(compact)) return formatIbanDisplay(compact);
  // Swiss BBAN+check without country (19 chars) → prepend CH
  if (/^\d{19}$/.test(compact)) {
    const withCh = `CH${compact}`;
    if (looksLikeIban(withCh)) return formatIbanDisplay(withCh);
  }
  return null;
}

/** Period / calendar range inside parentheses — keep; do not treat as account. */
export function looksLikePeriodParen(inner: string): boolean {
  const t = (inner || "").trim();
  if (!t) return false;
  if (
    /\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}\s*[-–—]\s*\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}/.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}\s+bis\s+\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}/i.test(
      t
    )
  ) {
    return true;
  }
  if (looksLikeDateToken(t)) return true;
  if (/^\d{1,2}[./\-]\d{4}$/.test(t)) return true;
  if (
    /^(jan|feb|mär|maerz|apr|mai|jun|jul|aug|sep|okt|nov|dez)[a-zäöü.]*\s+\d{4}$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

function looksLikeAccountParen(inner: string): boolean {
  const t = (inner || "").trim();
  if (!t || looksLikePeriodParen(t)) return false;
  if (recoverIbanDisplay(t)) return true;
  const compact = t.replace(/[\s._\-]/g, "").toUpperCase();
  if (/^(?:CH)?\d{15,34}$/.test(compact)) return true;
  if (/^[•*X]{2,}.+\d{4}$/i.test(t) || /^••••\s*\d{4}$/.test(t)) return true;
  if (/^\d{2,6}[.\-]\d{2,8}/.test(t)) return true;
  // Masked / spaced card-like, not a date
  if (
    /[•*X]{3,}|\d{4}[\s\-]+\d{4}/i.test(t) &&
    t.replace(/\D/g, "").length >= 4 &&
    t.replace(/\D/g, "").length <= 19 &&
    !/\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(t)
  ) {
    return true;
  }
  return false;
}

function parenAlreadyShowsAccount(text: string, account: string): boolean {
  const compactAcct = account.replace(/[\s._\-]/g, "").toUpperCase();
  if (compactAcct.length < 4) return false;
  const acctIban = recoverIbanDisplay(account);
  for (const m of text.matchAll(/\(([^)]+)\)/g)) {
    const inner = (m[1] || "").trim();
    if (looksLikePeriodParen(inner)) continue;
    const innerCompact = inner.replace(/[\s._\-]/g, "").toUpperCase();
    if (innerCompact === compactAcct) return true;
    if (acctIban && recoverIbanDisplay(inner) === acctIban) return true;
    // Card last-4 match
    const acctLast4 = compactAcct.replace(/\D/g, "").slice(-4);
    const innerLast4 = innerCompact.replace(/\D/g, "").slice(-4);
    if (
      acctLast4.length === 4 &&
      innerLast4 === acctLast4 &&
      (/[•*]/.test(inner) || /[•*]/.test(account))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Ensure account/IBAN/card appears as « (xxx)» after the free text
 * (period ranges stay as-is, not in parentheses).
 * e.g. «Kontoauszug Raiffeisen 01.07.2026 - 31.07.2026»
 *   → «Kontoauszug Raiffeisen 01.07.2026 - 31.07.2026 (CH78 …)»
 */
export function ensureAccountInParens(
  text: string,
  account: string
): string {
  const acct = (recoverIbanDisplay(account) || account).trim();
  if (!acct) return text.trim();
  let t = (text || "").replace(/\s+/g, " ").trim();

  // Strip only trailing account/IBAN/card parens — never date ranges
  t = t
    .replace(/\s*\(([^)]{2,48})\)\s*\.?$/i, (full, inner: string) =>
      looksLikeAccountParen(inner) ? "" : full
    )
    .replace(/(?:CH)?\d{15,34}\s*\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/, "");

  if (parenAlreadyShowsAccount(t, acct)) {
    return t;
  }

  const compactAcct = acct.replace(/[\s._\-]/g, "");
  const compactText = t.replace(/[\s._\-]/g, "");
  // Glued at end without parentheses → peel off then re-append cleanly
  if (
    compactAcct.length >= 4 &&
    new RegExp(`${compactAcct}$`, "i").test(compactText)
  ) {
    t = t
      .replace(new RegExp(`${compactAcct.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "")
      .trim()
      .replace(/[.,;:]+$/, "");
  }

  return `${t} (${acct})`;
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
  const iban = recoverIbanDisplay(t);
  if (iban) return iban;
  // Bare long digit runs are almost always broken IBANs — do not keep as «Konto»
  const compactDigits = t.replace(/[\s._\-]/g, "");
  if (/^\d{15,34}$/.test(compactDigits)) return null;
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
  const norm = normalizeOcrText(text || "");
  // Prefer IBAN after an «IBAN» label (country code optional — recover CH)
  const labeled =
    /IBAN\s*[:#.]?\s*((?:[A-Z]{2})?\d{2}(?:[\s]?[A-Z0-9]{4}){2,7}(?:[\s]?[A-Z0-9]{1,4})?)/gi;
  for (const m of norm.matchAll(labeled)) {
    const recovered = recoverIbanDisplay(m[1] || "");
    if (recovered) return recovered;
  }
  for (const m of norm.matchAll(IBAN_RE)) {
    const recovered = recoverIbanDisplay(m[1] || "");
    if (recovered) return recovered;
  }
  // Digit-only Swiss IBAN near «IBAN» without country letters
  const bare = /IBAN\s*[:#.]?\s*(\d{4}(?:[\s]?\d{4}){3,5})/gi;
  for (const m of norm.matchAll(bare)) {
    const recovered = recoverIbanDisplay(m[1] || "");
    if (recovered) return recovered;
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
 * Bank statements → IBAN first; credit-card statements → card first;
 * otherwise Kontonummer → card → IBAN.
 * OCR beats AI prose (AI often invents «Mitglieder Privatkonto» as account_number).
 * Stored in account_number and appended to title/summary as «(…)».
 */
export function resolveAccountNumber(input: {
  accountNumber?: string | null;
  title?: string | null;
  shortSummary?: string | null;
  content?: string | null;
}): string | null {
  const hay = haystack(input);
  const cardDoc = looksLikeCreditCardStatement(hay);
  const bankDoc = looksLikeBankDocument(hay) && !cardDoc;

  if (cardDoc) {
    const card = extractCardNumber(hay);
    if (card) return card;
    const iban = extractIban(hay);
    if (iban) return iban;
    return sanitizeAiAccount(input.accountNumber);
  }

  if (bankDoc) {
    const iban = extractIban(hay);
    if (iban) return iban;
    const labeled = extractLabeledAccountNumber(hay);
    if (labeled) return labeled;
    const local = extractLocalAccountNumber(hay);
    if (local) return local;
    return sanitizeAiAccount(input.accountNumber);
  }

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
