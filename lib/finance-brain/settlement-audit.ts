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
