import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createFinanceExpense,
  getFinanceLedgerById,
  listFinanceExpenseSplits,
  listPaperlessFinancialItemsForImport,
  listTripDocumentsForImport,
} from "@/lib/finance-brain/queries";
import { serializeExpense } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const ImportSchema = z.object({
  documentId: z.number().int().positive(),
  paidByMemberId: z.number().int().positive(),
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  exchangeRate: z.number().positive().optional(),
  description: z.string().max(500).nullable().optional(),
  expenseDate: z.string().nullable().optional(),
  tripEventId: z.number().int().positive().nullable().optional(),
  memberIds: z.array(z.number().int().positive()).optional(),
});

export async function GET(_request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  const ledger = getFinanceLedgerById(id);
  if (!ledger) {
    return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
  }
  const tripDocuments = ledger.trip_id
    ? listTripDocumentsForImport(ledger.trip_id)
    : [];
  const paperlessItems = listPaperlessFinancialItemsForImport(100);
  return NextResponse.json({
    tripDocuments,
    paperlessItems,
  });
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    const ledger = getFinanceLedgerById(id);
    if (!ledger) {
      return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
    }
    const body = await request.json();
    const parsed = ImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }

    let amount = parsed.data.amount;
    let currency = parsed.data.currency?.toUpperCase();
    let description = parsed.data.description;
    let expenseDate = parsed.data.expenseDate;
    let tripEventId = parsed.data.tripEventId ?? null;

    if (ledger.trip_id) {
      const doc = listTripDocumentsForImport(ledger.trip_id).find(
        (d) => d.document_id === parsed.data.documentId
      );
      if (doc) {
        amount = amount ?? doc.amount ?? undefined;
        currency = currency ?? doc.currency?.toUpperCase() ?? ledger.base_currency;
        description =
          description ??
          ([doc.vendor, doc.title].filter(Boolean).join(" · ") || doc.title);
        expenseDate = expenseDate ?? doc.invoice_date;
        tripEventId = tripEventId ?? doc.trip_event_id;
      }
    }
    if (amount == null || !currency) {
      const paperless = listPaperlessFinancialItemsForImport(500).find(
        (d) => d.document_id === parsed.data.documentId
      );
      if (paperless) {
        amount = amount ?? paperless.amount ?? undefined;
        currency =
          currency ?? paperless.currency?.toUpperCase() ?? ledger.base_currency;
        description =
          description ??
          ([paperless.vendor, paperless.title].filter(Boolean).join(" · ") ||
            paperless.title);
        expenseDate = expenseDate ?? paperless.invoice_date;
      }
    }

    if (amount == null || !currency) {
      return NextResponse.json(
        { error: "Betrag und Währung erforderlich" },
        { status: 400 }
      );
    }

    const expense = createFinanceExpense(id, {
      paidByMemberId: parsed.data.paidByMemberId,
      amount,
      currency,
      exchangeRate: parsed.data.exchangeRate,
      description,
      expenseDate,
      documentId: parsed.data.documentId,
      tripEventId,
      split: {
        mode: "equal",
        memberIds: parsed.data.memberIds ?? [],
      },
    });
    return NextResponse.json({
      ok: true,
      expense: serializeExpense(expense, listFinanceExpenseSplits(expense.id)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
