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
    net: roundMoney(
      row.paidBase -
        row.owedBase +
        row.settlementsPaidBase -
        row.settlementsReceivedBase
    ),
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
    const net = roundMoney(b.net);
    if (net > epsilon) {
      creditors.push({ id: b.memberId, name: b.displayName, amount: net });
    } else if (net < -epsilon) {
      debtors.push({
        id: b.memberId,
        name: b.displayName,
        amount: roundMoney(-net),
      });
    }
  }

  creditors.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "de"));
  debtors.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "de"));

  const debts: SimplifiedDebt[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = roundMoney(Math.min(debtor.amount, creditor.amount));
    if (pay > epsilon) {
      debts.push({
        fromMemberId: debtor.id,
        fromName: debtor.name,
        toMemberId: creditor.id,
        toName: creditor.name,
        amount: pay,
      });
      debtor.amount = roundMoney(debtor.amount - pay);
      creditor.amount = roundMoney(creditor.amount - pay);
    } else {
      // Dust only — advance the smaller side so we never loop forever.
      if (debtor.amount <= creditor.amount) debtor.amount = 0;
      else creditor.amount = 0;
    }
    if (debtor.amount <= epsilon) i += 1;
    if (creditor.amount <= epsilon) j += 1;
  }

  return debts;
}

export type PayerDebtEdge = {
  fromMemberId: number;
  toMemberId: number;
  amount: number;
};

/**
 * Open debts oriented by who paid: each split share (except the payer's own)
 * creates from→payer. Settlements reduce from→to. Same-pair directions are netted.
 */
export function buildPayerOrientedDebts(
  expenseEdges: PayerDebtEdge[],
  settlements: PayerDebtEdge[],
  nameById: Map<number, string>,
  epsilon = 0.005
): SimplifiedDebt[] {
  const directed = new Map<string, number>();
  const key = (from: number, to: number) => `${from}:${to}`;

  const add = (from: number, to: number, amount: number) => {
    if (from === to || !Number.isFinite(amount) || amount === 0) return;
    const k = key(from, to);
    directed.set(k, (directed.get(k) || 0) + amount);
  };

  for (const e of expenseEdges) add(e.fromMemberId, e.toMemberId, e.amount);
  for (const s of settlements) add(s.fromMemberId, s.toMemberId, -s.amount);

  const ids = [...nameById.keys()].sort((a, b) => a - b);
  const debts: SimplifiedDebt[] = [];

  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      const idA = ids[a];
      const idB = ids[b];
      const ab = directed.get(key(idA, idB)) || 0;
      const ba = directed.get(key(idB, idA)) || 0;
      const net = roundMoney(ab - ba);
      if (net > epsilon) {
        debts.push({
          fromMemberId: idA,
          fromName: nameById.get(idA) || `#${idA}`,
          toMemberId: idB,
          toName: nameById.get(idB) || `#${idB}`,
          amount: net,
        });
      } else if (net < -epsilon) {
        debts.push({
          fromMemberId: idB,
          fromName: nameById.get(idB) || `#${idB}`,
          toMemberId: idA,
          toName: nameById.get(idA) || `#${idA}`,
          amount: roundMoney(-net),
        });
      }
    }
  }

  debts.sort((x, y) => {
    const byFrom = x.fromName.localeCompare(y.fromName, "de");
    if (byFrom !== 0) return byFrom;
    return x.toName.localeCompare(y.toName, "de");
  });
  return debts;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type CapSettlementResult = {
  amount: number;
  capped: boolean;
  overpayBy: number;
  creditorNet: number;
};

/**
 * Cap a suggested repayment so it does not exceed the creditor's remaining
 * positive net (what they are still owed overall). Nach Zahler suggestions
 * can exceed this (e.g. boat share 48 vs net credit 47.50).
 */
export function capSettlementToCreditorNet(
  suggested: number,
  creditorNet: number,
  epsilon = 0.005
): CapSettlementResult {
  const suggestedAmt = roundMoney(Math.max(0, suggested));
  const net = roundMoney(Math.max(0, creditorNet));
  if (suggestedAmt <= net + epsilon) {
    return {
      amount: suggestedAmt,
      capped: false,
      overpayBy: 0,
      creditorNet: net,
    };
  }
  return {
    amount: net,
    capped: true,
    overpayBy: roundMoney(suggestedAmt - net),
    creditorNet: net,
  };
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
