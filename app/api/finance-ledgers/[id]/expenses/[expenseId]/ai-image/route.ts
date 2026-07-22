import { NextResponse } from "next/server";
import { classifyAndStoreExpenseCategory } from "@/lib/finance-brain/expense-classify";
import {
  clearExpenseAiImage,
  generateExpenseAiImage,
} from "@/lib/finance-brain/expense-image";
import { buildExpenseImagePrompt } from "@/lib/finance-brain/expense-image-prompt";
import { getExpenseAiImagePromptTemplate } from "@/lib/finance-brain/expense-image-settings";
import { sceneForExpenseCategory } from "@/lib/finance-brain/expense-category";
import {
  getFinanceExpenseById,
  getFinanceLedgerById,
  getFinanceLedgerMemberById,
  listFinanceExpenseSplits,
} from "@/lib/finance-brain/queries";
import { serializeExpense } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

export async function GET(_request: Request, context: Ctx) {
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
  const payer = getFinanceLedgerMemberById(expense.paid_by_member_id);
  const prompt = buildExpenseImagePrompt(
    {
      category: expense.category_label,
      description: expense.description,
      amount: expense.amount,
      currency: expense.currency,
      expenseDate: expense.expense_date,
      paidByName: payer?.display_name,
      scene: sceneForExpenseCategory(expense.category_label),
    },
    getExpenseAiImagePromptTemplate()
  );
  return NextResponse.json({
    prompt,
    hasImage: Boolean(expense.ai_image_path),
    expense: serializeExpense(expense, listFinanceExpenseSplits(expenseId)),
  });
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw, expenseId: expenseIdRaw } = await context.params;
    const ledgerId = Number(idRaw);
    const expenseId = Number(expenseIdRaw);
    if (!getFinanceLedgerById(ledgerId)) {
      return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
    }
    let expense = getFinanceExpenseById(expenseId);
    if (!expense || expense.ledger_id !== ledgerId) {
      return NextResponse.json({ error: "Ausgabe nicht gefunden" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      delete?: boolean;
      classifyOnly?: boolean;
      useSettings?: boolean;
      prompt?: string;
      place?: string | null;
    };

    if (body.delete) {
      expense = clearExpenseAiImage(expenseId);
      return NextResponse.json({
        ok: true,
        expense: serializeExpense(expense, listFinanceExpenseSplits(expenseId)),
      });
    }

    if (!expense.category_label || body.classifyOnly) {
      expense = await classifyAndStoreExpenseCategory(expense, body.place);
    }
    if (body.classifyOnly) {
      return NextResponse.json({
        ok: true,
        expense: serializeExpense(expense, listFinanceExpenseSplits(expenseId)),
      });
    }

    const prompt =
      body.useSettings === false && body.prompt?.trim()
        ? body.prompt.trim()
        : null;
    expense = await generateExpenseAiImage(expenseId, {
      userPrompt: prompt,
      place: body.place,
    });
    return NextResponse.json({
      ok: true,
      expense: serializeExpense(expense, listFinanceExpenseSplits(expenseId)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
