import { NextResponse } from "next/server";
import {
  collectBalanceInputs,
  getFinanceLedgerMemberByToken,
  listFinanceExpenses,
  listFinanceExpenseSplits,
  listFinanceLedgerMembers,
  listFinanceSettlements,
} from "@/lib/finance-brain/queries";
import {
  buildBalancePayload,
  serializeExpense,
  serializeLedger,
  serializeMember,
  serializeSettlement,
} from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

function resolveMember(token: string) {
  const member = getFinanceLedgerMemberByToken(token);
  if (!member) return null;
  return member;
}

export async function GET(_request: Request, context: Ctx) {
  const { token } = await context.params;
  const member = resolveMember(token);
  if (!member) {
    return NextResponse.json(
      { error: "Einladungs-Link ungültig oder widerrufen." },
      { status: 404 }
    );
  }
  const ledgerId = member.ledger_id;
  const members = listFinanceLedgerMembers(ledgerId).map(serializeMember);
  const expenses = listFinanceExpenses(ledgerId).map((e) =>
    serializeExpense(e, listFinanceExpenseSplits(e.id), { shareToken: token })
  );
  const settlements = listFinanceSettlements(ledgerId).map(serializeSettlement);
  const balances = buildBalancePayload(collectBalanceInputs(ledgerId));
  return NextResponse.json({
    ok: true,
    member: serializeMember(member),
    ledger: serializeLedger(member.ledger),
    members,
    expenses,
    settlements,
    ...balances,
  });
}
