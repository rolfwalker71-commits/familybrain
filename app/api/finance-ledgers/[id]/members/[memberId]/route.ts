import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getFinanceLedgerById,
  getFinanceLedgerMemberById,
  revokeFinanceLedgerMember,
  rotateFinanceLedgerMemberToken,
  updateFinanceLedgerMember,
} from "@/lib/finance-brain/queries";
import { serializeMemberWithToken } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; memberId: string }> };

const PatchSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  email: z.string().email().nullable().optional(),
  rotateToken: z.boolean().optional(),
  revoke: z.boolean().optional(),
});

export async function PATCH(request: Request, context: Ctx) {
  try {
    const { id: idRaw, memberId: memberIdRaw } = await context.params;
    const ledgerId = Number(idRaw);
    const memberId = Number(memberIdRaw);
    if (!getFinanceLedgerById(ledgerId)) {
      return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
    }
    const existing = getFinanceLedgerMemberById(memberId);
    if (!existing || existing.ledger_id !== ledgerId) {
      return NextResponse.json({ error: "Teilnehmer nicht gefunden" }, { status: 404 });
    }
    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    if (parsed.data.revoke) {
      const revoked = revokeFinanceLedgerMember(memberId);
      return NextResponse.json({
        ok: true,
        member: revoked ? serializeMemberWithToken(revoked) : null,
      });
    }
    if (parsed.data.rotateToken) {
      const rotated = rotateFinanceLedgerMemberToken(memberId);
      return NextResponse.json({
        ok: true,
        member: serializeMemberWithToken(rotated),
      });
    }
    const updated = updateFinanceLedgerMember(memberId, {
      displayName: parsed.data.displayName,
      email: parsed.data.email,
    });
    return NextResponse.json({
      ok: true,
      member: serializeMemberWithToken(updated),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
