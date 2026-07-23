import { NextResponse } from "next/server";
import { z } from "zod";
import {
  EXPENSE_DIRECTIONS,
  SPLIT_MODES,
} from "@/lib/finance-brain/constants";
import { classifyAndStoreExpenseCategory } from "@/lib/finance-brain/expense-classify";
import { geocodePlace } from "@/lib/finance-brain/geocode";
import {
  createFinanceExpense,
  getFinanceLedgerById,
  isNormalLedger,
  listFinanceExpenseSplits,
  type ExpenseSplitInput,
} from "@/lib/finance-brain/queries";
import { serializeExpense } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const SplitSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("equal"),
    memberIds: z.array(z.number().int().positive()).optional(),
  }),
  z.object({
    mode: z.literal("exact"),
    amounts: z.array(
      z.object({
        memberId: z.number().int().positive(),
        amountBase: z.number().positive(),
      })
    ),
  }),
  z.object({
    mode: z.literal("shares"),
    shares: z.array(
      z.object({
        memberId: z.number().int().positive(),
        units: z.number().positive(),
      })
    ),
  }),
]);

const CreateSchema = z.object({
  paidByMemberId: z.number().int().positive().optional(),
  createdByMemberId: z.number().int().positive().nullable().optional(),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  exchangeRate: z.number().positive().optional(),
  description: z.string().max(500).nullable().optional(),
  expenseDate: z.string().nullable().optional(),
  documentId: z.number().int().positive().nullable().optional(),
  tripEventId: z.number().int().positive().nullable().optional(),
  place: z.string().max(200).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  direction: z.enum(EXPENSE_DIRECTIONS).optional(),
  split: SplitSchema.optional(),
});

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    const ledger = getFinanceLedgerById(id);
    if (!ledger) {
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }

    const normal = isNormalLedger(ledger);
    if (!normal) {
      if (parsed.data.paidByMemberId == null) {
        return NextResponse.json(
          { error: "Zahler ist erforderlich" },
          { status: 400 }
        );
      }
      if (!parsed.data.split) {
        return NextResponse.json(
          { error: "Aufteilung ist erforderlich" },
          { status: 400 }
        );
      }
      if (!SPLIT_MODES.includes(parsed.data.split.mode)) {
        return NextResponse.json(
          { error: "Ungültiger Split-Modus" },
          { status: 400 }
        );
      }
    }

    const placeRaw = parsed.data.place?.trim() || null;
    let placeLat: number | null = null;
    let placeLon: number | null = null;
    let placeName = placeRaw;
    if (placeRaw) {
      const geo = await geocodePlace(placeRaw);
      if (geo) {
        placeLat = geo.lat;
        placeLon = geo.lon;
        placeName = placeRaw;
      }
    }

    const split = parsed.data.split
      ? ({
          ...parsed.data.split,
          memberIds:
            parsed.data.split.mode === "equal"
              ? (parsed.data.split.memberIds ?? [])
              : undefined,
        } as ExpenseSplitInput)
      : undefined;

    let expense = createFinanceExpense(id, {
      paidByMemberId: parsed.data.paidByMemberId ?? null,
      createdByMemberId: parsed.data.createdByMemberId ?? null,
      amount: parsed.data.amount,
      currency: parsed.data.currency.toUpperCase(),
      exchangeRate: parsed.data.exchangeRate,
      description: parsed.data.description ?? null,
      expenseDate: parsed.data.expenseDate ?? null,
      documentId: parsed.data.documentId ?? null,
      tripEventId: parsed.data.tripEventId ?? null,
      placeName,
      placeLat,
      placeLon,
      note: parsed.data.note ?? null,
      direction: parsed.data.direction ?? "expense",
      split,
    });
    expense = await classifyAndStoreExpenseCategory(expense, placeName);
    return NextResponse.json({
      ok: true,
      expense: serializeExpense(expense, listFinanceExpenseSplits(expense.id)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
