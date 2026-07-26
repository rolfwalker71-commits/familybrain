import { roundMoney } from "@/lib/finance-brain/settlement";

export type ShareMatrixMember = {
  id: number;
  displayName: string;
};

export type ShareMatrixExpense = {
  id: number;
  description: string | null;
  amount_base: number;
  paid_by_member_id: number;
  direction?: "expense" | "income";
  pre_settled?: number | boolean;
  splits: Array<{ member_id: number; share_amount_base: number }>;
};

export type ShareMatrixRow = {
  expenseId: number;
  description: string;
  payerId: number;
  amountBase: number;
  preSettled: boolean;
  /** Share per member id; 0 if not involved. */
  sharesByMemberId: Record<number, number>;
};

export type ShareMatrix = {
  members: ShareMatrixMember[];
  rows: ShareMatrixRow[];
  shareTotalByMemberId: Record<number, number>;
  paidTotalByMemberId: Record<number, number>;
  netByMemberId: Record<number, number>;
  /** Sum of nets; should be ~0. */
  netSum: number;
};

export function buildShareMatrix(
  expenses: ShareMatrixExpense[],
  members: ShareMatrixMember[]
): ShareMatrix {
  const memberIds = members.map((m) => m.id);
  const shareTotalByMemberId: Record<number, number> = {};
  const paidTotalByMemberId: Record<number, number> = {};
  for (const id of memberIds) {
    shareTotalByMemberId[id] = 0;
    paidTotalByMemberId[id] = 0;
  }

  const rows: ShareMatrixRow[] = [];
  for (const exp of expenses) {
    if ((exp.direction || "expense") === "income") continue;
    const sharesByMemberId: Record<number, number> = {};
    for (const id of memberIds) sharesByMemberId[id] = 0;
    for (const sp of exp.splits) {
      if (!(sp.member_id in sharesByMemberId)) continue;
      const amt = roundMoney(Number(sp.share_amount_base) || 0);
      sharesByMemberId[sp.member_id] = amt;
      shareTotalByMemberId[sp.member_id] = roundMoney(
        (shareTotalByMemberId[sp.member_id] || 0) + amt
      );
    }
    const amountBase = roundMoney(Number(exp.amount_base) || 0);
    if (exp.paid_by_member_id in paidTotalByMemberId) {
      paidTotalByMemberId[exp.paid_by_member_id] = roundMoney(
        (paidTotalByMemberId[exp.paid_by_member_id] || 0) + amountBase
      );
    }
    rows.push({
      expenseId: exp.id,
      description: exp.description?.trim() || "Ausgabe",
      payerId: exp.paid_by_member_id,
      amountBase,
      preSettled: Boolean(exp.pre_settled),
      sharesByMemberId,
    });
  }

  const netByMemberId: Record<number, number> = {};
  let netSum = 0;
  for (const id of memberIds) {
    const net = roundMoney(
      (paidTotalByMemberId[id] || 0) - (shareTotalByMemberId[id] || 0)
    );
    netByMemberId[id] = net;
    netSum = roundMoney(netSum + net);
  }

  return {
    members,
    rows,
    shareTotalByMemberId,
    paidTotalByMemberId,
    netByMemberId,
    netSum,
  };
}

export type DebtGridCell = {
  fromMemberId: number;
  toMemberId: number;
  amount: number;
};

export type DebtGrid = {
  memberIds: number[];
  /** amount that row (from) owes column (to); 0 if none */
  amounts: Record<string, number>;
  rowTotals: Record<number, number>;
  colTotals: Record<number, number>;
};

function debtKey(from: number, to: number): string {
  return `${from}:${to}`;
}

export function buildDebtGrid(
  debts: Array<{
    fromMemberId: number;
    toMemberId: number;
    amount: number;
  }>,
  memberIds: number[]
): DebtGrid {
  const amounts: Record<string, number> = {};
  const rowTotals: Record<number, number> = {};
  const colTotals: Record<number, number> = {};
  for (const id of memberIds) {
    rowTotals[id] = 0;
    colTotals[id] = 0;
  }
  for (const d of debts) {
    const amt = roundMoney(Number(d.amount) || 0);
    if (amt <= 0) continue;
    const k = debtKey(d.fromMemberId, d.toMemberId);
    amounts[k] = roundMoney((amounts[k] || 0) + amt);
    if (d.fromMemberId in rowTotals) {
      rowTotals[d.fromMemberId] = roundMoney(
        (rowTotals[d.fromMemberId] || 0) + amt
      );
    }
    if (d.toMemberId in colTotals) {
      colTotals[d.toMemberId] = roundMoney(
        (colTotals[d.toMemberId] || 0) + amt
      );
    }
  }
  return { memberIds, amounts, rowTotals, colTotals };
}

export function debtGridAmount(
  grid: DebtGrid,
  fromMemberId: number,
  toMemberId: number
): number {
  return grid.amounts[debtKey(fromMemberId, toMemberId)] || 0;
}

export type PairDebtSettlement = {
  id?: number;
  fromMemberId: number;
  toMemberId: number;
  amountBase: number;
  note?: string | null;
};

export type PairDebtLineKind =
  | "owe_from_booking"
  | "credit_from_booking"
  | "settlement_paid"
  | "settlement_received";

export type PairDebtLine = {
  kind: PairDebtLineKind;
  /** Signed contribution toward from→to net (positive = increases debt). */
  signedAmount: number;
  label: string;
  expenseId?: number;
  settlementId?: number;
  preSettled?: boolean;
};

export type PairDebtExplanation = {
  fromMemberId: number;
  toMemberId: number;
  fromName: string;
  toName: string;
  /** Gross: from's shares on to's expenses. */
  oweTotal: number;
  /** Gross: to's shares on from's expenses. */
  creditTotal: number;
  /** Settlements from→to (reduce debt). */
  settlementPaidTotal: number;
  /** Settlements to→from (increase from→to net). */
  settlementReceivedTotal: number;
  /** Net from owes to (same logic as Nach Zahler). */
  netAmount: number;
  lines: PairDebtLine[];
};

/**
 * Trace a Nach-Zahler cell: bookings + settlements between two people,
 * netted the same way as buildPayerOrientedDebts.
 */
export function explainPairDebt(
  expenses: ShareMatrixExpense[],
  settlements: PairDebtSettlement[],
  fromMemberId: number,
  toMemberId: number,
  nameById: Map<number, string>
): PairDebtExplanation {
  const fromName = nameById.get(fromMemberId) || `#${fromMemberId}`;
  const toName = nameById.get(toMemberId) || `#${toMemberId}`;
  const lines: PairDebtLine[] = [];
  let oweTotal = 0;
  let creditTotal = 0;
  let settlementPaidTotal = 0;
  let settlementReceivedTotal = 0;

  for (const exp of expenses) {
    if ((exp.direction || "expense") === "income") continue;
    const payerId = exp.paid_by_member_id;
    const label = exp.description?.trim() || "Ausgabe";
    const preSettled = Boolean(exp.pre_settled);

    if (payerId === toMemberId) {
      const share = exp.splits.find((s) => s.member_id === fromMemberId);
      const amt = roundMoney(Number(share?.share_amount_base) || 0);
      if (amt <= 0) continue;
      oweTotal = roundMoney(oweTotal + amt);
      lines.push({
        kind: "owe_from_booking",
        signedAmount: amt,
        label,
        expenseId: exp.id,
        preSettled,
      });
    } else if (payerId === fromMemberId) {
      const share = exp.splits.find((s) => s.member_id === toMemberId);
      const amt = roundMoney(Number(share?.share_amount_base) || 0);
      if (amt <= 0) continue;
      creditTotal = roundMoney(creditTotal + amt);
      lines.push({
        kind: "credit_from_booking",
        signedAmount: -amt,
        label,
        expenseId: exp.id,
        preSettled,
      });
    }
  }

  for (const s of settlements) {
    const amt = roundMoney(Number(s.amountBase) || 0);
    if (amt <= 0) continue;
    const note = s.note?.trim() || "Rückzahlung";
    if (s.fromMemberId === fromMemberId && s.toMemberId === toMemberId) {
      settlementPaidTotal = roundMoney(settlementPaidTotal + amt);
      lines.push({
        kind: "settlement_paid",
        signedAmount: -amt,
        label: note,
        settlementId: s.id,
      });
    } else if (
      s.fromMemberId === toMemberId &&
      s.toMemberId === fromMemberId
    ) {
      settlementReceivedTotal = roundMoney(settlementReceivedTotal + amt);
      lines.push({
        kind: "settlement_received",
        signedAmount: amt,
        label: note,
        settlementId: s.id,
      });
    }
  }

  const kindOrder: Record<PairDebtLineKind, number> = {
    owe_from_booking: 0,
    credit_from_booking: 1,
    settlement_paid: 2,
    settlement_received: 3,
  };
  lines.sort(
    (a, b) =>
      kindOrder[a.kind] - kindOrder[b.kind] ||
      Math.abs(b.signedAmount) - Math.abs(a.signedAmount)
  );

  const netAmount = roundMoney(
    oweTotal - creditTotal - settlementPaidTotal + settlementReceivedTotal
  );

  return {
    fromMemberId,
    toMemberId,
    fromName,
    toName,
    oweTotal,
    creditTotal,
    settlementPaidTotal,
    settlementReceivedTotal,
    netAmount,
    lines,
  };
}
