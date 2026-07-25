import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireLedgerAccess,
} from "@/lib/auth/current-user";
import {
  createFinanceLedgerCouple,
  defaultCoupleName,
  getFinanceLedgerById,
  getFinanceLedgerMemberById,
  isNormalLedger,
  listFinanceLedgerCouples,
  listFinanceLedgerMembers,
} from "@/lib/finance-brain/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const CreateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  memberIds: z.array(z.number().int().positive()).max(2).optional(),
});

export async function GET(_request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const ledgerId = Number(idRaw);
  if (!Number.isInteger(ledgerId) || ledgerId <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const auth = await requireLedgerAccess(ledgerId);
  if (isAuthError(auth)) return auth;
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) {
    return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
  }
  if (isNormalLedger(ledger)) {
    return NextResponse.json({ couples: [] });
  }
  const couples = listFinanceLedgerCouples(ledgerId).map((c) => {
    const memberIds = listFinanceLedgerMembers(ledgerId)
      .filter((m) => m.couple_id === c.id)
      .map((m) => m.id);
    return { ...c, memberIds };
  });
  return NextResponse.json({ couples });
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const ledgerId = Number(idRaw);
    const auth = await requireLedgerAccess(ledgerId);
    if (isAuthError(auth)) return auth;
    const ledger = getFinanceLedgerById(ledgerId);
    if (!ledger) {
      return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
    }
    if (isNormalLedger(ledger)) {
      return NextResponse.json(
        { error: "Paare sind nur bei Split-Abrechnungen möglich" },
        { status: 400 }
      );
    }
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const memberIds = parsed.data.memberIds ?? [];
    const names = memberIds.map(
      (id) => getFinanceLedgerMemberById(id)?.display_name || `#${id}`
    );
    const name =
      parsed.data.name?.trim() || defaultCoupleName(names);
    const couple = createFinanceLedgerCouple(ledgerId, { name, memberIds });
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
