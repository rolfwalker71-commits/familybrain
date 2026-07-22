import { NextResponse } from "next/server";
import {
  deleteFinanceExpense,
  getFinanceExpenseById,
  getFinanceLedgerById,
} from "@/lib/finance-brain/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { id: idRaw, expenseId: expenseIdRaw } = await context.params;
    const ledgerId = Number(idRaw);
    const expenseId = Number(expenseIdRaw);
    if (!getFinanceLedgerById(ledgerId)) {
      return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
    }
    const expense = getFinanceExpenseById(expenseId);
    if (!expense || expense.ledger_id !== ledgerId) {
      return NextResponse.json({ error: "Ausgabe nicht gefunden" }, { status: 404 });
    }
    deleteFinanceExpense(expenseId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
