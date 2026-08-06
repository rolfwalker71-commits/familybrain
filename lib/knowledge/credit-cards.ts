import { getDb } from "@/lib/db/client";
import { createHash } from "crypto";
import { documentAiIconPublicUrl } from "@/lib/paperless/document-icon";
import {
  formatBankAccountHeading,
  isCreditCardOverviewDocument,
  normalizeAccountKey,
} from "@/lib/extraction/bank";
import { normalizeLineItem } from "@/lib/extraction/line-items";
import { resolveInvoiceTotal } from "@/lib/extraction/line-items";
import {
  canonicalMerchant,
  merchantLogoUrl,
  shouldAutoExcludeCreditCardLine,
} from "@/lib/finance/merchants";

export type CreditCardCharge = {
  /** Stable fingerprint across re-analysis while the printed row stays equal. */
  key: string;
  /** ISO date; «--MM-DD» when the statement printed no year. */
  date: string | null;
  description: string;
  merchantKey: string;
  merchantLabel: string;
  merchantLogoUrl: string | null;
  amount: number | null;
  currency: string;
  foreignAmount: number | null;
  foreignCurrency: string | null;
  excluded: boolean;
  autoExcluded: boolean;
  excludedByMerchant: boolean;
};

export type CreditCardStatement = {
  documentId: number;
  paperlessId: number;
  title: string;
  date: string | null;
  year: number | null;
  total: number | null;
  currency: string;
  aiIconUrl: string | null;
  correspondentName: string | null;
  charges: CreditCardCharge[];
  /** Sum of extracted charges — differs from total when extraction is partial. */
  chargeSum: number;
  /** Sum used by totals/statistics after exclusions. */
  includedTotal: number;
  excludedChargeCount: number;
};

export type CreditCardGroup = {
  cardKey: string;
  label: string;
  bankName: string | null;
  accountNumber: string | null;
  statements: CreditCardStatement[];
  total: number;
  chargeCount: number;
  excludedChargeCount: number;
};

export type MerchantTotal = {
  key: string;
  label: string;
  logoUrl: string | null;
  total: number;
  count: number;
  /** Sum/count before exclusions; displayed in the hidden section. */
  rawTotal: number;
  rawCount: number;
  excluded: boolean;
};

export type CreditCardOverview = {
  years: number[];
  /** Selected year, or null when showing all years. */
  year: number | null;
  groups: CreditCardGroup[];
  merchants: MerchantTotal[];
  /** Totals per year across all cards, newest first. */
  yearTotals: Array<{ year: number; total: number; statements: number }>;
  total: number;
  statementCount: number;
  chargeCount: number;
  /** Statements without any extracted charge — hint to re-run analysis. */
  statementsWithoutCharges: number;
};

type StatementRow = {
  id: number;
  paperless_id: number;
  title: string | null;
  created_date: string | null;
  correspondent_name: string | null;
  ai_icon_path: string | null;
  short_summary: string | null;
  bank_name: string | null;
  account_number: string | null;
  amounts: string | null;
  line_items: string | null;
};

type DecisionScope = "merchant" | "charge";

type StatDecision = {
  scope: DecisionScope;
  decision_key: string;
  excluded: number;
};

function chargeFingerprint(input: {
  documentId: number;
  occurrence: number;
  date: string | null;
  description: string;
  merchantKey: string;
  amount: number | null;
  currency: string;
  foreignAmount: number | null;
  foreignCurrency: string | null;
}): string {
  const value = [
    input.documentId,
    input.date || "",
    input.description.trim().toLowerCase(),
    input.merchantKey,
    input.amount ?? "",
    input.currency,
    input.foreignAmount ?? "",
    input.foreignCurrency || "",
    input.occurrence,
  ].join("|");
  return `${input.documentId}:${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function listStatDecisions(): Map<string, boolean> {
  const rows = getDb()
    .prepare(
      `SELECT scope, decision_key, excluded
       FROM credit_card_stat_decisions`
    )
    .all() as StatDecision[];
  return new Map(
    rows.map((row) => [
      `${row.scope}:${row.decision_key}`,
      row.excluded === 1,
    ])
  );
}

export function setCreditCardStatDecision(input: {
  scope: DecisionScope;
  key: string;
  excluded: boolean;
}): void {
  getDb()
    .prepare(
      `INSERT INTO credit_card_stat_decisions
        (scope, decision_key, excluded, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(scope, decision_key) DO UPDATE SET
         excluded = excluded.excluded,
         updated_at = excluded.updated_at`
    )
    .run(input.scope, input.key, input.excluded ? 1 : 0);
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function yearOf(date: string | null | undefined): number | null {
  const m = /^(\d{4})/.exec((date || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1990 && y <= 2100 ? y : null;
}

/** Statement rows print «dd.mm» often — fill the year from the statement date. */
function resolveChargeDate(
  chargeDate: string | null,
  statementYear: number | null
): string | null {
  if (!chargeDate) return null;
  if (chargeDate.startsWith("--")) {
    if (statementYear == null) return null;
    return `${statementYear}${chargeDate.slice(1)}`;
  }
  return chargeDate;
}

function buildCharges(
  row: StatementRow,
  statementYear: number | null,
  decisions: Map<string, boolean>
): CreditCardCharge[] {
  const raw = parseJsonArray<Record<string, unknown>>(row.line_items);
  const occurrences = new Map<string, number>();
  return raw.map((item) => {
    const normalized = normalizeLineItem(item);
    const merchant = canonicalMerchant(
      normalized.merchant || normalized.description
    );
    const date = resolveChargeDate(normalized.date, statementYear);
    const currency = (normalized.currency || "CHF").toUpperCase();
    const baseFingerprint = [
      date || "",
      normalized.description.trim().toLowerCase(),
      merchant.key,
      normalized.amount ?? "",
      currency,
      normalized.foreignAmount ?? "",
      normalized.foreignCurrency || "",
    ].join("|");
    const occurrence = occurrences.get(baseFingerprint) || 0;
    occurrences.set(baseFingerprint, occurrence + 1);
    const key = chargeFingerprint({
      documentId: row.id,
      occurrence,
      date,
      description: normalized.description,
      merchantKey: merchant.key,
      amount: normalized.amount,
      currency,
      foreignAmount: normalized.foreignAmount,
      foreignCurrency: normalized.foreignCurrency,
    });
    const autoExcluded = shouldAutoExcludeCreditCardLine(
      normalized.description,
      merchant.label
    );
    const merchantDecision = decisions.get(`merchant:${merchant.key}`);
    const chargeDecision = decisions.get(`charge:${key}`);
    const excludedByMerchant = merchantDecision === true;
    const excluded =
      merchantDecision === true
        ? true
        : merchantDecision === false
          ? (chargeDecision ?? false)
          : (chargeDecision ?? autoExcluded);
    return {
      key,
      date,
      description: normalized.description,
      merchantKey: merchant.key,
      merchantLabel: merchant.label,
      merchantLogoUrl: merchantLogoUrl(merchant),
      amount: normalized.amount,
      currency,
      foreignAmount: normalized.foreignAmount,
      foreignCurrency: normalized.foreignCurrency,
      excluded,
      autoExcluded,
      excludedByMerchant,
    };
  });
}

function cardKeyFor(row: StatementRow): string {
  const account = normalizeAccountKey(row.account_number);
  if (account) return account;
  const bank = row.bank_name?.trim() || row.correspondent_name?.trim();
  return bank ? `bank:${bank.toLowerCase()}` : "ohne-karte";
}

/**
 * Credit-card statements as Karte → Abrechnung → Belastungen,
 * plus merchant totals for the selected year.
 */
export function getCreditCardOverview(input?: {
  year?: number | null;
}): CreditCardOverview {
  const db = getDb();
  const decisions = listStatDecisions();
  const rows = db
    .prepare(
      `SELECT d.id, d.paperless_id, d.title, d.created_date, d.correspondent_name,
              d.ai_icon_path, s.short_summary, s.bank_name, s.account_number,
              s.amounts, s.line_items
       FROM document_summaries s
       JOIN paperless_documents d ON d.id = s.document_id
       WHERE s.analysis_status = 'completed'
         AND s.category = 'Kreditkarten'
         AND COALESCE(d.sync_status, 'synced') != 'missing'
       ORDER BY COALESCE(d.created_date, d.added_at, d.created_at) DESC`
    )
    .all() as StatementRow[];

  const allStatements: Array<{ row: StatementRow; st: CreditCardStatement }> =
    [];

  for (const row of rows) {
    const year = yearOf(row.created_date);
    const charges = buildCharges(row, year, decisions);
    if (
      !isCreditCardOverviewDocument({
        title: row.title,
        summary: row.short_summary,
        correspondentName: row.correspondent_name,
        bankName: row.bank_name,
        accountNumber: row.account_number,
        lineItemCount: charges.length,
      })
    ) {
      continue;
    }
    const amounts = parseJsonArray<{
      amount?: number | null;
      currency?: string | null;
      label?: string | null;
    }>(row.amounts);
    const total = resolveInvoiceTotal({ amounts, financialItems: [] });
    const chargeSum = charges.reduce((sum, c) => sum + (c.amount ?? 0), 0);
    const includedTotal = charges.reduce(
      (sum, c) => sum + (c.excluded ? 0 : (c.amount ?? 0)),
      0
    );

    allStatements.push({
      row,
      st: {
        documentId: row.id,
        paperlessId: row.paperless_id,
        title: row.title?.trim() || `Abrechnung #${row.paperless_id}`,
        date: row.created_date,
        year,
        total:
          charges.length > 0
            ? includedTotal
            : (total?.amount ?? null),
        currency: total?.currency?.toUpperCase() || "CHF",
        aiIconUrl: documentAiIconPublicUrl(row.ai_icon_path),
        correspondentName: row.correspondent_name,
        charges,
        chargeSum,
        includedTotal,
        excludedChargeCount: charges.filter((c) => c.excluded).length,
      },
    });
  }

  const years = [
    ...new Set(
      allStatements
        .map((s) => s.st.year)
        .filter((y): y is number => typeof y === "number")
    ),
  ].sort((a, b) => b - a);

  const yearTotals = years.map((year) => {
    const inYear = allStatements.filter((s) => s.st.year === year);
    return {
      year,
      total: inYear.reduce((sum, s) => sum + (s.st.total ?? 0), 0),
      statements: inYear.length,
    };
  });

  const requestedYear = input?.year ?? null;
  const selected =
    requestedYear == null
      ? allStatements
      : allStatements.filter((s) => s.st.year === requestedYear);

  const byCard = new Map<string, CreditCardGroup>();
  for (const { row, st } of selected) {
    const key = cardKeyFor(row);
    const group = byCard.get(key) || {
      cardKey: key,
      label: formatBankAccountHeading({
        bankName: row.bank_name || row.correspondent_name,
        accountNumber: row.account_number,
      }),
      bankName: row.bank_name,
      accountNumber: row.account_number,
      statements: [],
    total: 0,
      chargeCount: 0,
      excludedChargeCount: 0,
    };
    group.statements.push(st);
    group.total += st.total ?? 0;
    group.chargeCount += st.charges.length;
    group.excludedChargeCount += st.excludedChargeCount;
    byCard.set(key, group);
  }

  const groups = [...byCard.values()]
    .map((g) => ({
      ...g,
      statements: [...g.statements].sort((a, b) =>
        (b.date || "").localeCompare(a.date || "")
      ),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "de"));

  const byMerchant = new Map<string, MerchantTotal>();
  for (const { st } of selected) {
    for (const charge of st.charges) {
      if (charge.amount == null) continue;
      const entry = byMerchant.get(charge.merchantKey) || {
        key: charge.merchantKey,
        label: charge.merchantLabel,
        logoUrl: charge.merchantLogoUrl,
        total: 0,
        count: 0,
        rawTotal: 0,
        rawCount: 0,
        excluded: true,
      };
      entry.rawTotal += charge.amount;
      entry.rawCount += 1;
      if (!charge.excluded) {
        entry.total += charge.amount;
        entry.count += 1;
        entry.excluded = false;
      }
      byMerchant.set(charge.merchantKey, entry);
    }
  }

  const merchants = [...byMerchant.values()].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label, "de")
  );

  return {
    years,
    year: requestedYear,
    groups,
    merchants,
    yearTotals,
    total: selected.reduce((sum, s) => sum + (s.st.total ?? 0), 0),
    statementCount: selected.length,
    chargeCount: selected.reduce((n, s) => n + s.st.charges.length, 0),
    statementsWithoutCharges: selected.filter(
      (s) => s.st.charges.length === 0
    ).length,
  };
}
