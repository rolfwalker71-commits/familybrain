export type BalanceInput = {
  memberId: number;
  displayName: string;
  paidBase: number;
  owedBase: number;
  settlementsReceivedBase: number;
  settlementsPaidBase: number;
};

export type MemberBalance = BalanceInput & {
  net: number;
};

export type SimplifiedDebt = {
  fromMemberId: number;
  fromName: string;
  toMemberId: number;
  toName: string;
  amount: number;
};

export function computeMemberBalances(rows: BalanceInput[]): MemberBalance[] {
  return rows.map((row) => ({
    ...row,
    // Settle-Up: paying someone back reduces your debt (improves net);
    // receiving a repayment reduces what others owe you.
    net:
      row.paidBase -
      row.owedBase +
      row.settlementsPaidBase -
      row.settlementsReceivedBase,
  }));
}

/** Greedy min-cash-flow debt simplification (Settle-Up style). */
export function simplifyDebts(
  balances: MemberBalance[],
  epsilon = 0.005
): SimplifiedDebt[] {
  type Node = { id: number; name: string; amount: number };
  const creditors: Node[] = [];
  const debtors: Node[] = [];

  for (const b of balances) {
    if (b.net > epsilon) {
      creditors.push({ id: b.memberId, name: b.displayName, amount: b.net });
    } else if (b.net < -epsilon) {
      debtors.push({
        id: b.memberId,
        name: b.displayName,
        amount: -b.net,
      });
    }
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const debts: SimplifiedDebt[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = Math.min(debtor.amount, creditor.amount);
    if (pay > epsilon) {
      debts.push({
        fromMemberId: debtor.id,
        fromName: debtor.name,
        toMemberId: creditor.id,
        toName: creditor.name,
        amount: roundMoney(pay),
      });
    }
    debtor.amount -= pay;
    creditor.amount -= pay;
    if (debtor.amount <= epsilon) i += 1;
    if (creditor.amount <= epsilon) j += 1;
  }

  return debts;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toBaseAmount(
  amount: number,
  currency: string,
  baseCurrency: string,
  exchangeRate: number
): number {
  const cur = currency.trim().toUpperCase();
  const base = baseCurrency.trim().toUpperCase();
  if (cur === base) return roundMoney(amount);
  return roundMoney(amount * exchangeRate);
}

export function computeEqualSplits(
  amountBase: number,
  memberIds: number[]
): Map<number, number> {
  const out = new Map<number, number>();
  if (memberIds.length === 0) return out;
  const each = roundMoney(amountBase / memberIds.length);
  let assigned = 0;
  for (let i = 0; i < memberIds.length; i++) {
    const id = memberIds[i];
    if (i === memberIds.length - 1) {
      out.set(id, roundMoney(amountBase - assigned));
    } else {
      out.set(id, each);
      assigned += each;
    }
  }
  return out;
}

export function computeShareSplits(
  amountBase: number,
  shares: Array<{ memberId: number; units: number }>
): Map<number, number> {
  const out = new Map<number, number>();
  const totalUnits = shares.reduce((s, x) => s + x.units, 0);
  if (totalUnits <= 0) return out;
  let assigned = 0;
  for (let i = 0; i < shares.length; i++) {
    const { memberId, units } = shares[i];
    if (i === shares.length - 1) {
      out.set(memberId, roundMoney(amountBase - assigned));
    } else {
      const part = roundMoney((amountBase * units) / totalUnits);
      out.set(memberId, part);
      assigned += part;
    }
  }
  return out;
}
