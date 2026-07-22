import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createFinanceSettlement,
  getFinanceLedgerMemberByToken,
} from "@/lib/finance-brain/queries";
import { serializeSettlement } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const CreateSchema = z.object({
  toMemberId: z.number().int().positive(),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  exchangeRate: z.number().positive().optional(),
  note: z.string().max(300).nullable().optional(),
  settledAt: z.string().nullable().optional(),
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
    const settlement = createFinanceSettlement(member.ledger_id, {
      fromMemberId: member.id,
      toMemberId: parsed.data.toMemberId,
      amount: parsed.data.amount,
      currency: parsed.data.currency.toUpperCase(),
      exchangeRate: parsed.data.exchangeRate,
      note: parsed.data.note ?? null,
      settledAt: parsed.data.settledAt ?? null,
      createdByMemberId: member.id,
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
