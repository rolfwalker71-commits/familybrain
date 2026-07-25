import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireLedgerAccess,
} from "@/lib/auth/current-user";
import {
  deleteFinanceLedgerCouple,
  getFinanceLedgerCoupleById,
  listFinanceLedgerMembers,
  updateFinanceLedgerCouple,
} from "@/lib/finance-brain/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; coupleId: string }> };

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

export async function PATCH(request: Request, context: Ctx) {
  try {
    const { id: idRaw, coupleId: coupleRaw } = await context.params;
    const ledgerId = Number(idRaw);
    const coupleId = Number(coupleRaw);
    const auth = await requireLedgerAccess(ledgerId);
    if (isAuthError(auth)) return auth;
    const existing = getFinanceLedgerCoupleById(coupleId);
    if (!existing || existing.ledger_id !== ledgerId) {
      return NextResponse.json({ error: "Paar nicht gefunden" }, { status: 404 });
    }
    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const couple = updateFinanceLedgerCouple(coupleId, {
      name: parsed.data.name,
    });
    return NextResponse.json({
      ok: true,
      couple: {
        ...couple,
        memberIds: listFinanceLedgerMembers(ledgerId)
          .filter((m) => m.couple_id === couple.id)
          .map((m) => m.id),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { id: idRaw, coupleId: coupleRaw } = await context.params;
    const ledgerId = Number(idRaw);
    const coupleId = Number(coupleRaw);
    const auth = await requireLedgerAccess(ledgerId);
    if (isAuthError(auth)) return auth;
    const existing = getFinanceLedgerCoupleById(coupleId);
    if (!existing || existing.ledger_id !== ledgerId) {
      return NextResponse.json({ error: "Paar nicht gefunden" }, { status: 404 });
    }
    deleteFinanceLedgerCouple(coupleId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
