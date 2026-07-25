import { NextResponse } from "next/server";
import {
  isAuthError,
  requireLedgerAccess,
} from "@/lib/auth/current-user";
import { z } from "zod";
import {
  collectBalanceInputs,
  getFinanceLedgerById,
  isNormalLedger,
  listFinanceLedgerMembers,
} from "@/lib/finance-brain/queries";
import { serializeMemberWithToken } from "@/lib/finance-brain/serialize";
import {
  buildInviteMailto,
  isEmailConfigured,
  sendBalanceReminderEmail,
} from "@/lib/finance-brain/email";
import { computeMemberBalances } from "@/lib/finance-brain/settlement";
import { absoluteAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const RemindSchema = z.object({
  memberId: z.number().int().positive().optional(),
});

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
        { error: "Erinnerungen sind nur bei Split-Abrechnungen möglich" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = RemindSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }

    const members = listFinanceLedgerMembers(ledgerId);
    const targets = parsed.data.memberId
      ? members.filter((m) => m.id === parsed.data.memberId)
      : members.filter((m) => m.email && !m.invite_revoked_at);

    const balances = computeMemberBalances(collectBalanceInputs(ledgerId));
    const balanceByMember = new Map(balances.map((b) => [b.memberId, b.net]));

    const results: Array<{
      memberId: number;
      ok: boolean;
      error?: string;
      mailto?: string;
    }> = [];

    for (const member of targets) {
      const serialized = serializeMemberWithToken(member);
      const shareUrl = absoluteAppUrl(serialized.share_url, request);
      const netBalance = balanceByMember.get(member.id) ?? 0;

      if (!member.email) {
        results.push({
          memberId: member.id,
          ok: false,
          error: "Keine E-Mail hinterlegt",
          mailto: buildInviteMailto({
            memberName: member.display_name,
            ledgerTitle: ledger.title,
            shareUrl,
          }),
        });
        continue;
      }

      const emailResult = await sendBalanceReminderEmail({
        to: member.email,
        memberName: member.display_name,
        ledgerTitle: ledger.title,
        shareUrl,
        netBalance,
        baseCurrency: ledger.base_currency,
      });
      results.push({
        memberId: member.id,
        ok: emailResult.ok,
        error: emailResult.error,
      });
    }

    return NextResponse.json({
      ok: true,
      emailConfigured: isEmailConfigured(),
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
