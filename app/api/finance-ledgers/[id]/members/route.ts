import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addFinanceLedgerMember,
  getFinanceLedgerById,
  listFinanceLedgerMembers,
  rotateFinanceLedgerMemberToken,
  revokeFinanceLedgerMember,
  updateFinanceLedgerMember,
} from "@/lib/finance-brain/queries";
import {
  buildInviteMailto,
  sendFinanceInviteEmail,
} from "@/lib/finance-brain/email";
import { serializeMemberWithToken } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const CreateSchema = z.object({
  displayName: z.string().min(1).max(80),
  email: z.string().email().nullable().optional(),
  sendEmail: z.boolean().optional(),
});

export async function GET(_request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!getFinanceLedgerById(id)) {
    return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({
    members: listFinanceLedgerMembers(id).map(serializeMemberWithToken),
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
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const member = addFinanceLedgerMember(id, {
      displayName: parsed.data.displayName,
      email: parsed.data.email ?? null,
    });
    const serialized = serializeMemberWithToken(member);
    const origin = new URL(request.url).origin;
    const shareUrl = `${origin}${serialized.share_url}`;

    let emailResult: { ok: boolean; error?: string } | null = null;
    if (parsed.data.sendEmail && member.email) {
      emailResult = await sendFinanceInviteEmail({
        to: member.email,
        memberName: member.display_name,
        ledgerTitle: ledger.title,
        shareUrl,
      });
    }

    return NextResponse.json({
      ok: true,
      member: serialized,
      shareUrl,
      mailto: buildInviteMailto({
        memberName: member.display_name,
        ledgerTitle: ledger.title,
        shareUrl,
      }),
      emailResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
