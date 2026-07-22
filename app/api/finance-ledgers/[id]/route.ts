import { NextResponse } from "next/server";
import { z } from "zod";
import {
  collectBalanceInputs,
  deleteFinanceLedger,
  getFinanceLedgerById,
  listFinanceExpenses,
  listFinanceExpenseSplits,
  listFinanceLedgerMembers,
  listFinanceSettlements,
  updateFinanceLedger,
} from "@/lib/finance-brain/queries";
import {
  buildBalancePayload,
  serializeExpense,
  serializeLedger,
  serializeMemberWithToken,
  serializeSettlement,
} from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  baseCurrency: z.string().min(3).max(3).optional(),
  tripId: z.number().int().positive().nullable().optional(),
  archived: z.boolean().optional(),
});

export async function GET(_request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const ledger = getFinanceLedgerById(id);
  if (!ledger) {
    return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
  }
  const members = listFinanceLedgerMembers(id).map(serializeMemberWithToken);
  const expenses = listFinanceExpenses(id).map((e) =>
    serializeExpense(e, listFinanceExpenseSplits(e.id))
  );
  const settlements = listFinanceSettlements(id).map(serializeSettlement);
  const balances = buildBalancePayload(collectBalanceInputs(id));
  return NextResponse.json({
    ledger: serializeLedger(ledger),
    members,
    expenses,
    settlements,
    ...balances,
  });
}

export async function PATCH(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const ledger = updateFinanceLedger(id, {
      title: parsed.data.title,
      baseCurrency: parsed.data.baseCurrency?.toUpperCase(),
      tripId: parsed.data.tripId,
      archived: parsed.data.archived,
    });
    return NextResponse.json({ ok: true, ledger: serializeLedger(ledger) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    deleteFinanceLedger(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
