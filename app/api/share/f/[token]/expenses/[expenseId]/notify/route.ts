import { NextResponse } from "next/server";
import {
  notifyFailed,
  notifyLedgerExpense,
} from "@/lib/finance-brain/notify";
import {
  getFinanceExpenseById,
  getFinanceLedgerMemberByToken,
} from "@/lib/finance-brain/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      return NextResponse.json({ error: "Ausgabe nicht gefunden" }, { status: 404 });
    }

    const notification = await notifyLedgerExpense(expenseId, { force: true });
    if (notifyFailed(notification) || !notification.ok) {
      return NextResponse.json(
        {
          error:
            notification.error ||
            notification.skipped ||
            "Mailversand fehlgeschlagen",
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
