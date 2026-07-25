import { formatDateDe } from "@/lib/finance-brain/format";
import {
  getFinanceLedgerById,
  getFinanceLedgerMemberById,
  isNormalLedger,
  listFinanceExpenses,
  listFinanceLedgerMembers,
  listFinanceSettlements,
  type FinanceExpenseRow,
} from "@/lib/finance-brain/queries";
import { buildLedgerBalancePayload } from "@/lib/finance-brain/serialize";
import { getTripById, getTripEventById } from "@/lib/trips/queries";
import { nowIso } from "@/lib/utils/dates";

export type TripSummaryExpense = {
  expenseId: number;
  description: string | null;
  categoryLabel: string | null;
  amount: number;
  currency: string;
  amountBase: number;
  baseCurrency: string;
  exchangeRate: number;
  paidByName: string;
  placeName: string | null;
  expenseDate: string | null;
  note: string | null;
  hasAiImage: boolean;
  aiCid: string;
  aiImagePath: string | null;
  activityLabel: string | null;
};

export type TripSummaryMemberBar = {
  displayName: string;
  paidBase: number;
  settlementsPaidBase: number;
  netBalance: number;
};

export type TripSummarySettlement = {
  fromName: string;
  toName: string;
  amountBase: number;
  settledAt: string | null;
  note: string | null;
};

export type TripSummaryOpenDebt = {
  fromName: string;
  toName: string;
  amount: number;
};

export type TripLedgerSummaryModel = {
  ledgerId: number;
  ledgerTitle: string;
  tripTitle: string | null;
  baseCurrency: string;
  exportedAt: string;
  expenses: TripSummaryExpense[];
  totalExpenseBase: number;
  totalSettlementsBase: number;
  members: TripSummaryMemberBar[];
  settlements: TripSummarySettlement[];
  openDebts: TripSummaryOpenDebt[];
};

function activityLabelForExpense(expense: FinanceExpenseRow): string | null {
  if (expense.trip_event_id == null) return null;
  const event = getTripEventById(expense.trip_event_id);
  if (!event) return null;
  const date = formatDateDe(event.start_date) || null;
  const time = event.start_time?.trim() || null;
  const when = date ? (time ? `${date}, ${time}` : date) : null;
  const title = event.title?.trim() || "Aktivität";
  return when ? `${when} · ${title}` : title;
}

export function buildTripLedgerSummaryModel(
  ledgerId: number
): TripLedgerSummaryModel {
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");
  if (isNormalLedger(ledger)) {
    throw new Error("Reise-Übersicht nur für Split-Abrechnungen");
  }
  if (ledger.trip_id == null) {
    throw new Error("Abrechnung ist mit keiner Reise verknüpft");
  }

  const trip = getTripById(ledger.trip_id);
  const expensesRaw = listFinanceExpenses(ledgerId).filter(
    (e) => (e.direction || "expense") !== "income"
  );
  const expenses: TripSummaryExpense[] = expensesRaw.map((expense) => {
    const payer = getFinanceLedgerMemberById(expense.paid_by_member_id);
    return {
      expenseId: expense.id,
      description: expense.description,
      categoryLabel: expense.category_label,
      amount: expense.amount,
      currency: expense.currency,
      amountBase: expense.amount_base,
      baseCurrency: ledger.base_currency,
      exchangeRate: expense.exchange_rate,
      paidByName: payer?.display_name || `#${expense.paid_by_member_id}`,
      placeName: expense.place_name,
      expenseDate: expense.expense_date,
      note: expense.note,
      hasAiImage: Boolean(expense.ai_image_path),
      aiCid: `expense-ai-${expense.id}`,
      aiImagePath: expense.ai_image_path,
      activityLabel: activityLabelForExpense(expense),
    };
  });

  const { balances, simplifiedDebts } = buildLedgerBalancePayload(ledgerId);
  const members: TripSummaryMemberBar[] = balances.map((b) => ({
    displayName: b.displayName,
    paidBase: b.paidBase,
    settlementsPaidBase: b.settlementsPaidBase,
    netBalance: b.netBalance,
  }));

  const settlements = listFinanceSettlements(ledgerId).map((s) => {
    const from = getFinanceLedgerMemberById(s.from_member_id);
    const to = getFinanceLedgerMemberById(s.to_member_id);
    return {
      fromName: from?.display_name || `#${s.from_member_id}`,
      toName: to?.display_name || `#${s.to_member_id}`,
      amountBase: s.amount_base,
      settledAt: s.settled_at,
      note: s.note,
    };
  });

  const totalExpenseBase = expenses.reduce((sum, e) => sum + e.amountBase, 0);
  const totalSettlementsBase = settlements.reduce(
    (sum, s) => sum + s.amountBase,
    0
  );

  return {
    ledgerId,
    ledgerTitle: ledger.title,
    tripTitle: trip?.title ?? null,
    baseCurrency: ledger.base_currency,
    exportedAt: nowIso(),
    expenses,
    totalExpenseBase,
    totalSettlementsBase,
    members,
    settlements,
    openDebts: simplifiedDebts.map((d) => ({
      fromName: d.fromDisplayName,
      toName: d.toDisplayName,
      amount: d.amount,
    })),
  };
}

export function listTripSummaryRecipients(ledgerId: number): Array<{
  memberId: number;
  displayName: string;
  email: string;
}> {
  return listFinanceLedgerMembers(ledgerId)
    .filter((m) => !m.invite_revoked_at && Boolean(m.email?.trim()))
    .map((m) => ({
      memberId: m.id,
      displayName: m.display_name,
      email: m.email!.trim(),
    }));
}
