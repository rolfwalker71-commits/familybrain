import type { DocumentAnalysis } from "@/lib/ai/schemas";
import { extractDocumentRefNumber } from "@/lib/documents/duplicates";
import {
  ensureAccountInParens,
  looksLikeAccountStatement,
  recoverIbanDisplay,
  resolveAccountNumber,
  resolveBankName,
  shortenInstitutionName,
} from "@/lib/extraction/bank";

function isoToSwiss(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function textHasRef(text: string, ref: string): boolean {
  const digits = ref.replace(/\D/g, "");
  if (!digits) return false;
  return text.replace(/\D/g, "").includes(digits) || text.includes(ref);
}

function textHasDateHint(text: string, swiss: string, iso: string): boolean {
  if (swiss && text.includes(swiss)) return true;
  if (iso && text.includes(iso)) return true;
  return false;
}

function textHasAccount(text: string, account: string): boolean {
  const compact = account.replace(/[\s._\-]/g, "");
  if (!compact) return false;
  if (text.includes(account)) return true;
  return text.replace(/[\s._\-]/g, "").includes(compact);
}

export function resolveDocumentReference(
  analysis: DocumentAnalysis,
  title?: string | null
): string | null {
  const fromField = analysis.document_reference?.trim();
  if (fromField) {
    const digits = fromField.replace(/\D/g, "");
    return digits.length >= 4 ? digits : fromField;
  }
  for (const fi of analysis.financial_items || []) {
    const n = fi.invoice_number?.trim();
    if (n) {
      const digits = n.replace(/\D/g, "");
      if (digits.length >= 4) return digits;
      return n;
    }
  }
  return (
    extractDocumentRefNumber(title) ||
    extractDocumentRefNumber(analysis.suggested_title) ||
    extractDocumentRefNumber(analysis.short_summary) ||
    null
  );
}

export function resolveDocumentIdentityDate(
  analysis: DocumentAnalysis,
  createdDate?: string | null
): string | null {
  for (const fi of analysis.financial_items || []) {
    if (fi.invoice_date?.trim()) return fi.invoice_date.trim().slice(0, 10);
  }
  for (const d of analysis.important_dates || []) {
    const label = (d.label || "").toLowerCase();
    if (
      /rechnung|beleg|dokument|ausgestellt|datum|invoice|premium|prämie/.test(
        label
      ) &&
      d.date?.trim()
    ) {
      return d.date.trim().slice(0, 10);
    }
  }
  const created = createdDate?.trim().slice(0, 10);
  return created && /^\d{4}-\d{2}-\d{2}$/.test(created) ? created : null;
}

/**
 * Ensure short_summary carries Belegnummer/Datum;
 * bank/card statements get (Kontonummer | Kartennummer | IBAN).
 */
export function enrichAnalysisIdentity(
  analysis: DocumentAnalysis,
  meta?: {
    title?: string | null;
    createdDate?: string | null;
    correspondent?: string | null;
    content?: string | null;
  }
): DocumentAnalysis {
  const ref = resolveDocumentReference(analysis, meta?.title);
  const isoDate = resolveDocumentIdentityDate(analysis, meta?.createdDate);
  const swissDate = isoToSwiss(isoDate);

  const hay = [
    meta?.title,
    analysis.suggested_title,
    analysis.short_summary,
    analysis.detailed_summary,
    meta?.content?.slice(0, 12000),
  ]
    .filter(Boolean)
    .join("\n");

  const bankName = resolveBankName({
    bankName: analysis.bank_name,
    correspondent: meta?.correspondent,
  });
  const accountNumber = resolveAccountNumber({
    accountNumber: analysis.account_number,
    title: meta?.title || analysis.suggested_title,
    shortSummary: analysis.short_summary,
    content: meta?.content,
  });
  const accountDisplay =
    (accountNumber && (recoverIbanDisplay(accountNumber) || accountNumber)) ||
    null;
  const looksLikeIbanOrCard = Boolean(
    accountDisplay &&
      (recoverIbanDisplay(accountDisplay) ||
        /[•*]{2,}|\bxxxx\b/i.test(accountDisplay))
  );
  // Always surface IBAN/card when detected — even if the title already has a period
  const isAccountStatement =
    looksLikeAccountStatement(hay) ||
    Boolean(accountNumber && bankName) ||
    looksLikeIbanOrCard;

  let short = shortenInstitutionName((analysis.short_summary || "").trim());
  let title = shortenInstitutionName((analysis.suggested_title || "").trim());
  const detailed = analysis.detailed_summary
    ? shortenInstitutionName(analysis.detailed_summary)
    : analysis.detailed_summary;

  if (ref && short && !textHasRef(short, ref)) {
    short = `${short.replace(/\.\s*$/, "")} · Nr. ${ref}.`;
  } else if (ref && !short) {
    short = `Beleg Nr. ${ref}.`;
  }

  if (
    swissDate &&
    isoDate &&
    short &&
    !textHasDateHint(short, swissDate, isoDate)
  ) {
    short = `${short.replace(/\.\s*$/, "")} · ${swissDate}.`;
  }

  if (isAccountStatement && accountDisplay && short) {
    short = ensureAccountInParens(short.replace(/\.\s*$/, ""), accountDisplay);
    if (!short.endsWith(".")) short = `${short}.`;
  } else if (isAccountStatement && accountDisplay && !short) {
    short = `Kontobeleg (${accountDisplay}).`;
  }

  if (ref && title && !textHasRef(title, ref)) {
    title = `${title} Nr. ${ref}`.slice(0, 120);
  }

  // Title: period stays plain; IBAN/card always in parentheses at the end
  if (isAccountStatement && accountDisplay && title) {
    title = ensureAccountInParens(title, accountDisplay).slice(0, 160);
  } else if (isAccountStatement && accountDisplay && !title) {
    title = `Kontoauszug (${accountDisplay})`.slice(0, 160);
  }

  return {
    ...analysis,
    document_reference: ref || analysis.document_reference || null,
    bank_name: bankName || analysis.bank_name || null,
    account_number: accountDisplay || analysis.account_number || null,
    short_summary: short || analysis.short_summary,
    detailed_summary: detailed,
    suggested_title: title || analysis.suggested_title,
  };
}
