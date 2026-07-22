import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createFinanceExpense,
  getFinanceLedgerMemberByToken,
  listFinanceExpenseSplits,
} from "@/lib/finance-brain/queries";
import { serializeExpense } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const CreateSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  exchangeRate: z.number().positive().optional(),
  description: z.string().max(500).nullable().optional(),
  expenseDate: z.string().nullable().optional(),
  paidByMemberId: z.number().int().positive().optional(),
  memberIds: z.array(z.number().int().positive()).optional(),
});

export async function POST(request: Request, context: Ctx) {
  try {
    const { token } = await context.params;
    const member = getFinanceLedgerMemberByToken(token);
    if (!member) {
      return NextResponse.json(
        { error: "Einladungs-Link ungültig oder widerrufen." },
        { status: 404 }
      );
    }
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const paidByMemberId = parsed.data.paidByMemberId ?? member.id;
    const expense = createFinanceExpense(member.ledger_id, {
      paidByMemberId,
      createdByMemberId: member.id,
      amount: parsed.data.amount,
      currency: parsed.data.currency.toUpperCase(),
      exchangeRate: parsed.data.exchangeRate,
      description: parsed.data.description ?? null,
      expenseDate: parsed.data.expenseDate ?? null,
      split: {
        mode: "equal",
        memberIds: parsed.data.memberIds ?? [],
      },
    });
    return NextResponse.json({
      ok: true,
      expense: serializeExpense(expense, listFinanceExpenseSplits(expense.id), {
        shareToken: token,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
