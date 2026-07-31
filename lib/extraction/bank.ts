/** Bank/tax statement helpers (used inside Steuern grouping). */

const BANK_DOC_RE =
  /kontoauszug|bankauszug|bankbeleg|depotauszug|saldoausweis|verm[oö]gensausweis|zins-?\s*und\s*kapitalausweis|zinsausweis|kapitalausweis|account\s*statement|bank\s*statement|portfolio\s*statement|verm[oö]gensaufstellung/i;

/** Local account numbers (not IBAN): 0020-16608-4A, masked ****1234, etc. */
const LOCAL_ACCOUNT_RE =
  /\b((?:\d{2,6}[.\-]\d{2,8}(?:[.\-]\d{1,6})?[A-Za-z0-9]?)|(?:\*{2,}\d{3,6}))\b/gi;

/** IBAN (CH / international), optional spaces between groups. */
const IBAN_RE =
  /\b([A-Z]{2}\d{2}(?:[\s]?[A-Z0-9]{4}){2,7}(?:[\s]?[A-Z0-9]{1,4})?)\b/gi;

export function looksLikeBankDocument(text: string): boolean {
  return BANK_DOC_RE.test(text || "");
}

export function looksLikeIban(raw: string | null | undefined): boolean {
  const compact = (raw || "").replace(/[\s._\-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
  return compact.length >= 15 && compact.length <= 34;
}

/** Format IBAN with spaces every 4 chars for the summary line. */
export function formatIbanDisplay(raw: string): string {
  const compact = raw.replace(/[\s._\-]/g, "").toUpperCase();
  if (!looksLikeIban(compact)) return raw.trim();
  return compact.replace(/(.{4})/g, "$1 ").trim();
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
      : acctRaw
    : null;
  if (bank && acct) return `${bank} · ${acct}`;
  if (acct) return looksLikeIban(acctRaw) ? `IBAN ${acct}` : `Konto ${acct}`;
  if (bank) return bank;
  return "Bankbeleg ohne Kontonummer";
}

function haystack(input: {
  title?: string | null;
  shortSummary?: string | null;
  content?: string | null;
}): string {
  return [input.title, input.shortSummary, (input.content || "").slice(0, 8000)]
    .filter(Boolean)
    .join("\n");
}

/** First plausible local Kontonummer in text (excludes IBAN-shaped matches). */
export function extractLocalAccountNumber(text: string): string | null {
  for (const m of (text || "").matchAll(LOCAL_ACCOUNT_RE)) {
    const cand = (m[1] || "").replace(/\s+/g, " ").trim();
    if (!cand || looksLikeIban(cand)) continue;
    const digits = cand.replace(/\D/g, "");
    if (digits.length < 6 && !/[A-Za-z]/.test(cand)) continue;
    if (/^(19|20)\d{2}$/.test(digits)) continue;
    return cand;
  }
  return null;
}

/** First IBAN in text, normalized for display. */
export function extractIban(text: string): string | null {
  for (const m of (text || "").matchAll(IBAN_RE)) {
    const cand = (m[1] || "").replace(/\s+/g, "").toUpperCase();
    if (!looksLikeIban(cand)) continue;
    return formatIbanDisplay(cand);
  }
  return null;
}

/**
 * Prefer Kontonummer; if missing, use IBAN.
 * Stored in account_number and appended to short_summary as «(…)».
 */
export function resolveAccountNumber(input: {
  accountNumber?: string | null;
  title?: string | null;
  shortSummary?: string | null;
  content?: string | null;
}): string | null {
  const fromAi = input.accountNumber?.trim();
  if (fromAi && fromAi.length >= 4) {
    return looksLikeIban(fromAi) ? formatIbanDisplay(fromAi) : fromAi;
  }

  const hay = haystack(input);
  const local = extractLocalAccountNumber(hay);
  if (local) return local;

  return extractIban(hay);
}

export function resolveBankName(input: {
  bankName?: string | null;
  correspondent?: string | null;
}): string | null {
  const fromAi = input.bankName?.trim();
  if (fromAi) return fromAi;
  const corr = input.correspondent?.trim();
  if (
    corr &&
    /bank|credit\s*suisse|ubs|raiffeisen|postfinance|zkb|cs\b|swissquote|julius\s*bär|julius\s*baer/i.test(
      corr
    )
  ) {
    return corr;
  }
  return null;
}
