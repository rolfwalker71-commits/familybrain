import { NextResponse } from "next/server";
import {
  notifyFailed,
  notifyLedgerExpense,
} from "@/lib/finance-brain/notify";
import {
  getFinanceExpenseById,
  getFinanceLedgerById,
} from "@/lib/finance-brain/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id: idRaw, expenseId: expenseIdRaw } = await context.params;
    const ledgerId = Number(idRaw);
    const expenseId = Number(expenseIdRaw);
    if (!getFinanceLedgerById(ledgerId)) {
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }
    const expense = getFinanceExpenseById(expenseId);
    if (!expense || expense.ledger_id !== ledgerId) {
      return NextResponse.json({ error: "Ausgabe nicht gefunden" }, { status: 404 });
    }

    const notification = await notifyLedgerExpense(expenseId, { force: true });
    if (notifyFailed(notification) || !notification.ok) {
      return NextResponse.json(
        {
          error: notification.error || notification.skipped || "Mailversand fehlgeschlagen",
          notification,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent: notification.sent,
      notification,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
