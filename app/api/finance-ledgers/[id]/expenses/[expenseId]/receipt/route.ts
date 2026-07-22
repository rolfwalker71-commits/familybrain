import { NextResponse } from "next/server";
import {
  clearExpenseReceipt,
  saveExpenseReceiptUpload,
} from "@/lib/finance-brain/receipts";
import {
  getFinanceExpenseById,
  getFinanceLedgerById,
  listFinanceExpenseSplits,
} from "@/lib/finance-brain/queries";
import { serializeExpense } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request, context: Ctx) {
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
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Leere Datei" }, { status: 400 });
    }
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "Datei zu gross (max. 12 MB)" },
        { status: 400 }
      );
    }

    await saveExpenseReceiptUpload(expenseId, buffer, file.type);
    const updated = getFinanceExpenseById(expenseId)!;
    return NextResponse.json({
      ok: true,
      expense: serializeExpense(updated, listFinanceExpenseSplits(expenseId)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    clearExpenseReceipt(expenseId);
    const updated = getFinanceExpenseById(expenseId)!;
    return NextResponse.json({
      ok: true,
      expense: serializeExpense(updated, listFinanceExpenseSplits(expenseId)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
