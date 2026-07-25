import { NextResponse } from "next/server";
import {
  isAuthError,
  requireLedgerAccess,
} from "@/lib/auth/current-user";
import { z } from "zod";
import {
  addFinanceLedgerMember,
  addFinanceLedgerMemberFromUser,
  getFinanceLedgerById,
  isNormalLedger,
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
import { absoluteAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const CreateSchema = z
  .object({
    displayName: z.string().min(1).max(80).optional(),
    email: z.string().email().nullable().optional(),
    userId: z.number().int().positive().optional(),
    sendEmail: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.userId) || Boolean(v.displayName?.trim()), {
    message: "Name oder Benutzer erforderlich",
  });

export async function GET(_request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  const auth = await requireLedgerAccess(id);
  if (isAuthError(auth)) return auth;
  const ledger = getFinanceLedgerById(id);
  if (!ledger) {
    return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
  }
  if (isNormalLedger(ledger)) {
    return NextResponse.json({ members: [] });
  }
  return NextResponse.json({
    members: listFinanceLedgerMembers(id).map(serializeMemberWithToken),
  });
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    const auth = await requireLedgerAccess(id);
    if (isAuthError(auth)) return auth;
    const ledger = getFinanceLedgerById(id);
    if (!ledger) {
      return NextResponse.json({ error: "Abrechnung nicht gefunden" }, { status: 404 });
    }
    if (isNormalLedger(ledger)) {
      return NextResponse.json(
        { error: "Teilnehmer sind nur bei Split-Abrechnungen möglich" },
        { status: 400 }
      );
    }
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const member = parsed.data.userId
      ? addFinanceLedgerMemberFromUser(id, parsed.data.userId)
      : addFinanceLedgerMember(id, {
          displayName: parsed.data.displayName!,
          email: parsed.data.email ?? null,
        });
    const serialized = serializeMemberWithToken(member);
    const shareUrl = absoluteAppUrl(serialized.share_url, request);

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
