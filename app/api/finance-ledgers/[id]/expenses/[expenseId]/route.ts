import { NextResponse } from "next/server";
import {
  isAuthError,
  requireLedgerAccess,
} from "@/lib/auth/current-user";
import { z } from "zod";
import { classifyAndStoreExpenseCategory } from "@/lib/finance-brain/expense-classify";
import { expenseVisualFromLabel } from "@/lib/finance-brain/expense-category";
import { geocodePlace } from "@/lib/finance-brain/geocode";
import {
  deleteFinanceExpense,
  getFinanceExpenseById,
  getFinanceLedgerById,
  listFinanceExpenseSplits,
  setFinanceExpenseCategory,
  updateFinanceExpense,
} from "@/lib/finance-brain/queries";
import { serializeExpense } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

const PatchSchema = z.object({
  description: z.string().max(500).nullable().optional(),
  expenseDate: z.string().nullable().optional(),
  paidByMemberId: z.number().int().positive().optional(),
  place: z.string().max(200).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  exchangeRate: z.number().positive().optional(),
  direction: z.enum(["expense", "income"]).optional(),
  documentId: z.number().int().positive().nullable().optional(),
  tripEventId: z.number().int().positive().nullable().optional(),
  /** Manual category override; skips AI reclassification when set. */
  categoryLabel: z.string().min(1).max(80).optional(),
  split: z
    .discriminatedUnion("mode", [
      z.object({
        mode: z.literal("equal"),
        memberIds: z.array(z.number().int().positive()).min(1),
      }),
      z.object({
        mode: z.literal("coupleEqual"),
        coupleIds: z.array(z.number().int().positive()).min(1),
      }),
    ])
    .optional(),
});

export async function PATCH(request: Request, context: Ctx) {
  try {
    const { id: idRaw, expenseId: expenseIdRaw } = await context.params;
    const ledgerId = Number(idRaw);
    const auth = await requireLedgerAccess(ledgerId);
    if (isAuthError(auth)) return auth;
    const expenseId = Number(expenseIdRaw);
    if (!getFinanceLedgerById(ledgerId)) {
      return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
    }
    const existing = getFinanceExpenseById(expenseId);
    if (!existing || existing.ledger_id !== ledgerId) {
      return NextResponse.json({ error: "Ausgabe nicht gefunden" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }

    const patch: Parameters<typeof updateFinanceExpense>[1] = {};
    if (parsed.data.description !== undefined) {
      patch.description = parsed.data.description;
    }
    if (parsed.data.expenseDate !== undefined) {
      patch.expenseDate = parsed.data.expenseDate;
    }
    if (parsed.data.paidByMemberId !== undefined) {
      patch.paidByMemberId = parsed.data.paidByMemberId;
    }
    if (parsed.data.note !== undefined) {
      patch.note = parsed.data.note;
    }
    if (parsed.data.amount !== undefined) {
      patch.amount = parsed.data.amount;
    }
    if (parsed.data.currency !== undefined) {
      patch.currency = parsed.data.currency.toUpperCase();
    }
    if (parsed.data.exchangeRate !== undefined) {
      patch.exchangeRate = parsed.data.exchangeRate;
    }
    if (parsed.data.direction !== undefined) {
      patch.direction = parsed.data.direction;
    }
    if (parsed.data.documentId !== undefined) {
      patch.documentId = parsed.data.documentId;
    }
    if (parsed.data.tripEventId !== undefined) {
      patch.tripEventId = parsed.data.tripEventId;
    }
    if (parsed.data.split !== undefined) {
      patch.split = parsed.data.split;
    }

    if (parsed.data.place !== undefined) {
      const placeRaw = parsed.data.place?.trim() || null;
      patch.placeName = placeRaw;
      if (!placeRaw) {
        patch.placeLat = null;
        patch.placeLon = null;
      } else if (placeRaw !== (existing.place_name || "").trim()) {
        const geo = await geocodePlace(placeRaw);
        patch.placeLat = geo?.lat ?? null;
        patch.placeLon = geo?.lon ?? null;
      }
    }

    let expense = updateFinanceExpense(expenseId, patch);
    if (parsed.data.categoryLabel !== undefined) {
      const visual = expenseVisualFromLabel(parsed.data.categoryLabel);
      expense = setFinanceExpenseCategory(expenseId, {
        categoryLabel: visual.label,
        categoryTone: visual.tone,
      });
    } else {
      expense = await classifyAndStoreExpenseCategory(
        expense,
        expense.place_name
      );
    }
    if (
      parsed.data.documentId != null &&
      parsed.data.documentId > 0
    ) {
      try {
        const ledger = getFinanceLedgerById(ledgerId);
        const { writebackLinkTagsToPaperless } = await import(
          "@/lib/paperless/writeback"
        );
        await writebackLinkTagsToPaperless({
          localDocumentId: parsed.data.documentId,
          ledgerId,
          ledgerTitle: ledger?.title ?? null,
          buddyStatus: "reisebeleg",
        });
      } catch (wbErr) {
        console.error(
          "[finance] paperless link writeback",
          wbErr instanceof Error ? wbErr.message : wbErr
        );
      }
    }
    return NextResponse.json({
      ok: true,
      expense: serializeExpense(expense, listFinanceExpenseSplits(expenseId)),
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
    const auth = await requireLedgerAccess(ledgerId);
    if (isAuthError(auth)) return auth;
    const expenseId = Number(expenseIdRaw);
    if (!getFinanceLedgerById(ledgerId)) {
      return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
    }
    const expense = getFinanceExpenseById(expenseId);
    if (!expense || expense.ledger_id !== ledgerId) {
      return NextResponse.json({ error: "Ausgabe nicht gefunden" }, { status: 404 });
    }
    deleteFinanceExpense(expenseId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
