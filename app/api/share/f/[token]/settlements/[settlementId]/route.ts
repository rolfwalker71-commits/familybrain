import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteFinanceSettlement,
  getFinanceLedgerMemberByToken,
  getFinanceSettlementById,
  updateFinanceSettlement,
} from "@/lib/finance-brain/queries";
import { serializeSettlement } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; settlementId: string }> };

const PatchSchema = z.object({
  fromMemberId: z.number().int().positive().optional(),
  toMemberId: z.number().int().positive().optional(),
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  exchangeRate: z.number().positive().optional(),
  note: z.string().max(300).nullable().optional(),
  settledAt: z.string().nullable().optional(),
});

export async function PATCH(request: Request, context: Ctx) {
  try {
    const { token, settlementId: settlementIdRaw } = await context.params;
    const member = getFinanceLedgerMemberByToken(token);
    if (!member) {
      return NextResponse.json(
        { error: "Einladungs-Link ungültig oder widerrufen." },
        { status: 404 }
      );
    }
    const settlementId = Number(settlementIdRaw);
    const existing = getFinanceSettlementById(settlementId);
    if (!existing || existing.ledger_id !== member.ledger_id) {
      return NextResponse.json({ error: "Rückzahlung nicht gefunden" }, { status: 404 });
    }
    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const settlement = updateFinanceSettlement(settlementId, {
      fromMemberId: parsed.data.fromMemberId,
      toMemberId: parsed.data.toMemberId,
      amount: parsed.data.amount,
      currency: parsed.data.currency?.toUpperCase(),
      exchangeRate: parsed.data.exchangeRate,
      note: parsed.data.note,
      settledAt: parsed.data.settledAt,
    });
    return NextResponse.json({
      ok: true,
      settlement: serializeSettlement(settlement),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { token, settlementId: settlementIdRaw } = await context.params;
    const member = getFinanceLedgerMemberByToken(token);
    if (!member) {
      return NextResponse.json(
        { error: "Einladungs-Link ungültig oder widerrufen." },
        { status: 404 }
      );
    }
    const settlementId = Number(settlementIdRaw);
    const existing = getFinanceSettlementById(settlementId);
    if (!existing || existing.ledger_id !== member.ledger_id) {
      return NextResponse.json({ error: "Rückzahlung nicht gefunden" }, { status: 404 });
    }
    deleteFinanceSettlement(settlementId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
