import { NextResponse } from "next/server";
import {
  getFinanceExpenseById,
  getFinanceLedgerMemberByToken,
  listFinanceExpenseSplits,
  settleCoupleExpenseManually,
} from "@/lib/finance-brain/queries";
import { serializeExpense } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; expenseId: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { token, expenseId: expenseIdRaw } = await context.params;
    const expenseId = Number(expenseIdRaw);
    const member = getFinanceLedgerMemberByToken(token);
    if (!member) {
      return NextResponse.json(
        { error: "Einladungs-Link ungültig oder widerrufen." },
        { status: 404 }
      );
    }
    const expense = getFinanceExpenseById(expenseId);
    if (!expense || expense.ledger_id !== member.ledger_id) {
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
        listFinanceExpenseSplits(result.expense.id),
        { shareToken: token }
      ),
      preview: result.preview,
      settlements: result.settlements,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
