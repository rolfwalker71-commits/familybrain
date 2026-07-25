import { getDb } from "@/lib/db/client";
import {
  getFinanceLedgerById,
  isNormalLedger,
} from "@/lib/finance-brain/queries";
import { buildLedgerBalancePayload } from "@/lib/finance-brain/serialize";
import { roundMoney } from "@/lib/finance-brain/settlement";

export type TripCostBucket = {
  label: string;
  totalBase: number;
  count: number;
  sharePct: number;
};

export type TripCostPerson = {
  memberId: number;
  displayName: string;
  paidBase: number;
  fairShareBase: number;
  deltaBase: number;
  netBalance: number;
};

export type TripCostDashboard = {
  baseCurrency: string;
  totalSpentBase: number;
  expenseCount: number;
  unlinkedCount: number;
  byPerson: TripCostPerson[];
  byCouple: Array<{
    coupleId: number;
    name: string;
    paidBase: number;
    fairShareBase: number;
    netBalance: number;
  }>;
  byCategory: TripCostBucket[];
  byEventType: TripCostBucket[];
};

export type TripCostSummary = {
  baseCurrency: string;
  totalSpentBase: number;
  expenseCount: number;
  topCategories: TripCostBucket[];
};

type ExpenseAggRow = {
  amount_base: number;
  category_label: string | null;
  trip_event_id: number | null;
  event_type: string | null;
};

function pct(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 1000) / 10);
}

function toBuckets(
  map: Map<string, { total: number; count: number }>,
  totalSpent: number
): TripCostBucket[] {
  return [...map.entries()]
    .map(([label, v]) => ({
      label,
      totalBase: roundMoney(v.total),
      count: v.count,
      sharePct: pct(v.total, totalSpent),
    }))
    .sort((a, b) => b.totalBase - a.totalBase || a.label.localeCompare(b.label, "de"));
}

function loadExpenseAgg(ledgerId: number): ExpenseAggRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT e.amount_base, e.category_label, e.trip_event_id, te.event_type
       FROM finance_expenses e
       LEFT JOIN trip_events te ON te.id = e.trip_event_id
       WHERE e.ledger_id = ?
         AND COALESCE(e.direction, 'expense') != 'income'
       ORDER BY e.id ASC`
    )
    .all(ledgerId) as ExpenseAggRow[];
}

export function buildTripCostDashboard(
  ledgerId: number
): TripCostDashboard | null {
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger || isNormalLedger(ledger)) return null;

  const rows = loadExpenseAgg(ledgerId);
  let totalSpentBase = 0;
  let unlinkedCount = 0;
  const byCategory = new Map<string, { total: number; count: number }>();
  const byEventType = new Map<string, { total: number; count: number }>();

  for (const row of rows) {
    const amount = Number(row.amount_base) || 0;
    totalSpentBase += amount;
    if (row.trip_event_id == null) unlinkedCount += 1;

    const cat = (row.category_label || "Ausgabe").trim() || "Ausgabe";
    const catEntry = byCategory.get(cat) || { total: 0, count: 0 };
    catEntry.total += amount;
    catEntry.count += 1;
    byCategory.set(cat, catEntry);

    const eventType =
      row.trip_event_id == null
        ? "Nicht mit Timeline verknüpft"
        : (row.event_type || "Aktivität").trim() || "Aktivität";
    const evEntry = byEventType.get(eventType) || { total: 0, count: 0 };
    evEntry.total += amount;
    evEntry.count += 1;
    byEventType.set(eventType, evEntry);
  }

  totalSpentBase = roundMoney(totalSpentBase);
  const balancePayload = buildLedgerBalancePayload(ledgerId);
  const balances = balancePayload.balances;

  return {
    baseCurrency: ledger.base_currency,
    totalSpentBase,
    expenseCount: rows.length,
    unlinkedCount,
    byPerson: balances.map((b) => ({
      memberId: b.memberId,
      displayName: b.displayName,
      paidBase: b.paidBase,
      fairShareBase: b.owedBase,
      deltaBase: roundMoney(b.paidBase - b.owedBase),
      netBalance: b.netBalance,
    })),
    byCouple: (balancePayload.coupleBalances || []).map((c) => ({
      coupleId: c.coupleId,
      name: c.name,
      paidBase: c.paidBase,
      fairShareBase: c.owedBase,
      netBalance: c.netBalance,
    })),
    byCategory: toBuckets(byCategory, totalSpentBase),
    byEventType: toBuckets(byEventType, totalSpentBase),
  };
}

export function buildTripCostSummary(
  ledgerId: number,
  topN = 3
): TripCostSummary | null {
  const full = buildTripCostDashboard(ledgerId);
  if (!full) return null;
  return {
    baseCurrency: full.baseCurrency,
    totalSpentBase: full.totalSpentBase,
    expenseCount: full.expenseCount,
    topCategories: full.byCategory.slice(0, topN),
  };
}
