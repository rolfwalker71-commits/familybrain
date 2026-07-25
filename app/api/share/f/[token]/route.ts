import { NextResponse } from "next/server";
import {
  getFinanceLedgerMemberByToken,
  listFinanceExpenses,
  listFinanceExpenseSplits,
  listFinanceLedgerCouples,
  listFinanceLedgerMembers,
  listFinanceSettlements,
} from "@/lib/finance-brain/queries";
import {
  buildLedgerBalancePayload,
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
  const coupleNameById = new Map(
    listFinanceLedgerCouples(ledgerId).map((c) => [c.id, c.name])
  );
  const serializeM = (m: {
    id: number;
    ledger_id: number;
    display_name: string;
    email: string | null;
    user_id?: number | null;
    couple_id?: number | null;
    invite_token: string;
    invite_revoked_at: string | null;
    created_at: string;
  }) =>
    serializeMember(
      {
        ...m,
        user_id: m.user_id ?? null,
        couple_id: m.couple_id ?? null,
      },
      m.couple_id != null ? coupleNameById.get(m.couple_id) ?? null : null
    );
  const members = listFinanceLedgerMembers(ledgerId).map((m) => serializeM(m));
  const expenses = listFinanceExpenses(ledgerId).map((e) =>
    serializeExpense(e, listFinanceExpenseSplits(e.id), { shareToken: token })
  );
  const settlements = listFinanceSettlements(ledgerId).map(serializeSettlement);
  const balances = buildLedgerBalancePayload(ledgerId);
  return NextResponse.json({
    ok: true,
    member: serializeM(member),
    ledger: serializeLedger(member.ledger),
    members,
    expenses,
    settlements,
    ...balances,
  });
}
