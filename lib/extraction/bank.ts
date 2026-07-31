/** Bank/tax statement helpers (used inside Steuern grouping). */

const BANK_DOC_RE =
  /kontoauszug|bankauszug|bankbeleg|depotauszug|saldoausweis|verm[oö]gensausweis|zins-?\s*und\s*kapitalausweis|zinsausweis|kapitalausweis|account\s*statement|bank\s*statement|portfolio\s*statement|verm[oö]gensaufstellung/i;

const ACCOUNT_CANDIDATE_RE =
  /\b((?:CH\d{2}(?:[\s]?\d{4}){4,5})|(?:\d{2,6}[.\-]\d{2,8}(?:[.\-]\d{1,6})?[A-Za-z0-9]?)|(?:\*{2,}\d{3,6}))\b/gi;

export function looksLikeBankDocument(text: string): boolean {
  return BANK_DOC_RE.test(text || "");
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
  const acct = input.accountNumber?.trim() || null;
  if (bank && acct) return `${bank} · ${acct}`;
  if (acct) return `Konto ${acct}`;
  if (bank) return bank;
  return "Bankbeleg ohne Kontonummer";
}

export function resolveAccountNumber(input: {
  accountNumber?: string | null;
  title?: string | null;
  shortSummary?: string | null;
  content?: string | null;
}): string | null {
  const fromAi = input.accountNumber?.trim();
  if (fromAi && fromAi.length >= 4) return fromAi;

  const hay = [
    input.title,
    input.shortSummary,
    (input.content || "").slice(0, 8000),
  ]
    .filter(Boolean)
    .join("\n");

  for (const m of hay.matchAll(ACCOUNT_CANDIDATE_RE)) {
    const cand = (m[1] || "").replace(/\s+/g, " ").trim();
    if (!cand) continue;
    const digits = cand.replace(/\D/g, "");
    if (digits.length < 6 && !/[A-Za-z]/.test(cand)) continue;
    if (/^(19|20)\d{2}$/.test(digits)) continue;
    return cand;
  }
  return null;
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
