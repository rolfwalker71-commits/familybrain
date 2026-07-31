import type { DocumentAnalysis } from "@/lib/ai/schemas";

const YEAR_RE = /\b((?:19|20)\d{2})\b/g;
const TAX_YEAR_HINT =
  /steuerjahr|steuerperiode|veranlagung|steuererkl[aä]rung|lohnausweis|lohnmeldeschein|quellensteuer|direkte bundessteuer|kantons-?\s*und gemeindesteuer|steuerrechnung|steuerbescheid/i;

/** Swiss tax / Lohnausweis docs that belong in Steuern (and often also Arbeit). */
export function looksLikeSwissTaxDocument(text: string): boolean {
  return TAX_YEAR_HINT.test(text);
}

export function looksLikeLohnausweis(text: string): boolean {
  return /lohnausweis|lohnmeldeschein|salary statement|certificat de salaire/i.test(
    text
  );
}

/**
 * Monthly payslip / Lohnabrechnung — belongs under Arbeit, not Steuern.
 * Must not match Jahres-Lohnausweis.
 */
export function looksLikeLohnabrechnung(text: string): boolean {
  if (looksLikeLohnausweis(text)) return false;
  return /lohnabrechnung|lohnabrechnungen|verdienstabrechnung|gehaltsabrechnung|sal[aä]rabrechnung|payslip|salary\s*slip|lohnblatt/i.test(
    text
  );
}

export function yearsFromText(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const years: number[] = [];
  for (const m of raw.matchAll(YEAR_RE)) {
    const y = Number(m[1]);
    if (y >= 1990 && y <= 2100) years.push(y);
  }
  return years;
}

/**
 * Prefer AI tax_year; else year near tax keywords in title/OCR; else document date year.
 */
export function resolveTaxYear(input: {
  taxYear?: number | null;
  title?: string | null;
  content?: string | null;
  createdDate?: string | null;
}): number | null {
  if (
    typeof input.taxYear === "number" &&
    Number.isInteger(input.taxYear) &&
    input.taxYear >= 1990 &&
    input.taxYear <= 2100
  ) {
    return input.taxYear;
  }

  const title = input.title || "";
  const contentHead = (input.content || "").slice(0, 4000);
  const combined = `${title}\n${contentHead}`;

  if (TAX_YEAR_HINT.test(combined) || TAX_YEAR_HINT.test(title)) {
    const fromTitle = yearsFromText(title);
    if (fromTitle.length > 0) return fromTitle[fromTitle.length - 1]!;
    const fromContent = yearsFromText(contentHead);
    if (fromContent.length > 0) return fromContent[0]!;
  }

  // Title year alone (e.g. "Steuererklärung 2025 …")
  const titleYears = yearsFromText(title);
  if (titleYears.length > 0 && /steuer|lohnausweis|veranlag/i.test(title)) {
    return titleYears[titleYears.length - 1]!;
  }

  const dateYear = yearsFromText((input.createdDate || "").slice(0, 4));
  return dateYear[0] ?? null;
}

export function resolveAlsoCategories(input: {
  analysis: DocumentAnalysis;
  title?: string | null;
  content?: string | null;
  category: string;
}): string[] {
  const fromAi = (input.analysis.also_categories || [])
    .map((c) => String(c || "").trim())
    .filter(Boolean);
  const text = `${input.title || ""}\n${(input.content || "").slice(0, 4000)}\n${input.analysis.short_summary || ""}\n${input.analysis.detailed_summary || ""}`;

  const set = new Set<string>(fromAi);
  if (input.category === "Steuern" && looksLikeLohnausweis(text)) {
    set.add("Arbeit");
  }
  if (input.analysis.also_in_arbeit === true) {
    set.add("Arbeit");
  }
  // Only persist known secondary areas for now
  return [...set].filter((c) => c === "Arbeit");
}

export function serializeAlsoCategories(cats: string[] | null | undefined): string | null {
  if (!cats || cats.length === 0) return null;
  return JSON.stringify(cats);
}

export function parseAlsoCategories(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x)).filter(Boolean);
  } catch {
    return [];
  }
}
