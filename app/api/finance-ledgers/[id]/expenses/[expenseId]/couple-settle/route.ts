import { NextResponse } from "next/server";
import {
  isAuthError,
  requireLedgerAccess,
} from "@/lib/auth/current-user";
import {
  getFinanceExpenseById,
  getFinanceLedgerById,
  listFinanceExpenseSplits,
  settleCoupleExpenseManually,
} from "@/lib/finance-brain/queries";
import { serializeExpense } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id: idRaw, expenseId: expenseIdRaw } = await context.params;
    const ledgerId = Number(idRaw);
    const auth = await requireLedgerAccess(ledgerId);
    if (isAuthError(auth)) return auth;
    const expenseId = Number(expenseIdRaw);
    if (!getFinanceLedgerById(ledgerId)) {
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }
    const expense = getFinanceExpenseById(expenseId);
    if (!expense || expense.ledger_id !== ledgerId) {
      return NextResponse.json(
        { error: "Ausgabe nicht gefunden" },
        { status: 404 }
      );
    }

    const result = settleCoupleExpenseManually(expenseId);
    return NextResponse.json({
      ok: true,
      expense: serializeExpense(
        result.expense,
        listFinanceExpenseSplits(result.expense.id)
      ),
      preview: result.preview,
      settlements: result.settlements,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
