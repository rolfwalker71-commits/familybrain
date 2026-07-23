import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createFinanceSettlement,
  getFinanceLedgerById,
  isNormalLedger,
} from "@/lib/finance-brain/queries";
import { serializeSettlement } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const CreateSchema = z.object({
  fromMemberId: z.number().int().positive(),
  toMemberId: z.number().int().positive(),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  exchangeRate: z.number().positive().optional(),
  note: z.string().max(300).nullable().optional(),
  settledAt: z.string().nullable().optional(),
  createdByMemberId: z.number().int().positive().nullable().optional(),
});

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    const ledger = getFinanceLedgerById(id);
    if (!ledger) {
      return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
    }
    if (isNormalLedger(ledger)) {
      return NextResponse.json(
        { error: "Rückzahlungen sind nur bei Split-Abrechnungen möglich" },
        { status: 400 }
      );
    }
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const settlement = createFinanceSettlement(id, {
      fromMemberId: parsed.data.fromMemberId,
      toMemberId: parsed.data.toMemberId,
      amount: parsed.data.amount,
      currency: parsed.data.currency.toUpperCase(),
      exchangeRate: parsed.data.exchangeRate,
      note: parsed.data.note ?? null,
      settledAt: parsed.data.settledAt ?? null,
      createdByMemberId: parsed.data.createdByMemberId ?? null,
    });
    const { notifyFailed, notifyLedgerSettlement } = await import(
      "@/lib/finance-brain/notify"
    );
    const notification = await notifyLedgerSettlement(settlement.id);
    if (notifyFailed(notification)) {
      console.error(
        "[finance-brain] settlement mail failed:",
        notification.error
      );
    }
    return NextResponse.json({
      ok: true,
      settlement: serializeSettlement(settlement),
      notification,
      ...(notification.error
        ? {
            warning: `Rückzahlung gespeichert, Belegmail fehlgeschlagen: ${notification.error}`,
          }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
