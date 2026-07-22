import { NextResponse } from "next/server";
import { classifyAndStoreExpenseCategory } from "@/lib/finance-brain/expense-classify";
import {
  clearExpenseAiImage,
  generateExpenseAiImage,
} from "@/lib/finance-brain/expense-image";
import { notifyLedgerExpense } from "@/lib/finance-brain/notify";
import {
  getFinanceExpenseById,
  getFinanceLedgerMemberByToken,
  listFinanceExpenseSplits,
} from "@/lib/finance-brain/queries";
import { serializeExpense } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ token: string; expenseId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { token, expenseId: expenseIdRaw } = await context.params;
  const expenseId = Number(expenseIdRaw);
  let generateAttempted = false;

  try {
    const member = getFinanceLedgerMemberByToken(token);
    if (!member) {
      return NextResponse.json(
        { error: "Einladungs-Link ungültig oder widerrufen." },
        { status: 404 }
      );
    }
    let expense = getFinanceExpenseById(expenseId);
    if (!expense || expense.ledger_id !== member.ledger_id) {
      return NextResponse.json({ error: "Ausgabe nicht gefunden" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      delete?: boolean;
      classifyOnly?: boolean;
      place?: string | null;
    };

    if (body.delete) {
      expense = clearExpenseAiImage(expenseId);
      return NextResponse.json({
        ok: true,
        expense: serializeExpense(expense, listFinanceExpenseSplits(expenseId), {
          shareToken: token,
        }),
      });
    }

    if (!expense.category_label || body.classifyOnly) {
      expense = await classifyAndStoreExpenseCategory(expense, body.place);
    }
    if (body.classifyOnly) {
      return NextResponse.json({
        ok: true,
        expense: serializeExpense(expense, listFinanceExpenseSplits(expenseId), {
          shareToken: token,
        }),
      });
    }

    generateAttempted = true;
    expense = await generateExpenseAiImage(expenseId, { place: body.place });
    try {
      await notifyLedgerExpense(expenseId);
    } catch (mailError) {
      console.error("[finance-brain] expense mail failed:", mailError);
    }
    return NextResponse.json({
      ok: true,
      expense: serializeExpense(expense, listFinanceExpenseSplits(expenseId), {
        shareToken: token,
      }),
    });
  } catch (error) {
    if (generateAttempted) {
      try {
        await notifyLedgerExpense(expenseId);
      } catch {
        /* ignore */
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
