import { NextResponse } from "next/server";
import {
  clearExpenseReceipt,
  saveExpenseReceiptUpload,
} from "@/lib/finance-brain/receipts";
import {
  getFinanceExpenseById,
  getFinanceLedgerMemberByToken,
  listFinanceExpenseSplits,
} from "@/lib/finance-brain/queries";
import { serializeExpense } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ token: string; expenseId: string }> };

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request, context: Ctx) {
  try {
    const { token, expenseId: expenseIdRaw } = await context.params;
    const member = getFinanceLedgerMemberByToken(token);
    if (!member) {
      return NextResponse.json(
        { error: "Einladungs-Link ungültig oder widerrufen." },
        { status: 404 }
      );
    }
    const expenseId = Number(expenseIdRaw);
    const expense = getFinanceExpenseById(expenseId);
    if (!expense || expense.ledger_id !== member.ledger_id) {
      return NextResponse.json({ error: "Ausgabe nicht gefunden" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Datei fehlt" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Nur Bilddateien erlaubt" },
        { status: 400 }
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return NextResponse.json(
        { error: buffer.length === 0 ? "Leere Datei" : "Datei zu gross (max. 12 MB)" },
        { status: 400 }
      );
    }

    await saveExpenseReceiptUpload(expenseId, buffer, file.type);
    const updated = getFinanceExpenseById(expenseId)!;
    return NextResponse.json({
      ok: true,
      expense: serializeExpense(updated, listFinanceExpenseSplits(expenseId), {
        shareToken: token,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { token, expenseId: expenseIdRaw } = await context.params;
    const member = getFinanceLedgerMemberByToken(token);
    if (!member) {
      return NextResponse.json(
        { error: "Einladungs-Link ungültig oder widerrufen." },
        { status: 404 }
      );
    }
    const expenseId = Number(expenseIdRaw);
    const expense = getFinanceExpenseById(expenseId);
    if (!expense || expense.ledger_id !== member.ledger_id) {
      return NextResponse.json({ error: "Ausgabe nicht gefunden" }, { status: 404 });
    }
    clearExpenseReceipt(expenseId);
    const updated = getFinanceExpenseById(expenseId)!;
    return NextResponse.json({
      ok: true,
      expense: serializeExpense(updated, listFinanceExpenseSplits(expenseId), {
        shareToken: token,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
