import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireLedgerAccess,
} from "@/lib/auth/current-user";
import {
  notifyFailed,
  notifyTripLedgerSummary,
} from "@/lib/finance-brain/notify";
import { getFinanceLedgerById, isNormalLedger } from "@/lib/finance-brain/queries";
import { listTripSummaryRecipients } from "@/lib/finance-brain/trip-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const PostSchema = z.object({
  recipientMemberIds: z.array(z.number().int().positive()).min(1),
});

export async function GET(_request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const ledgerId = Number(idRaw);
    const auth = await requireLedgerAccess(ledgerId);
    if (isAuthError(auth)) return auth;
    const ledger = getFinanceLedgerById(ledgerId);
    if (!ledger) {
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }
    if (isNormalLedger(ledger) || ledger.trip_id == null) {
      return NextResponse.json(
        { error: "Nur für Split-Abrechnungen mit verknüpfter Reise" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      recipients: listTripSummaryRecipients(ledgerId),
      tripId: ledger.trip_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const ledgerId = Number(idRaw);
    const auth = await requireLedgerAccess(ledgerId);
    if (isAuthError(auth)) return auth;
    const ledger = getFinanceLedgerById(ledgerId);
    if (!ledger) {
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }
    if (isNormalLedger(ledger) || ledger.trip_id == null) {
      return NextResponse.json(
        { error: "Nur für Split-Abrechnungen mit verknüpfter Reise" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bitte mindestens einen Empfänger wählen" },
        { status: 400 }
      );
    }

    const notification = await notifyTripLedgerSummary(
      ledgerId,
      parsed.data.recipientMemberIds
    );
    if (notifyFailed(notification) || !notification.ok) {
      return NextResponse.json(
        {
          error:
            notification.error ||
            notification.skipped ||
            "Mailversand fehlgeschlagen",
          notification,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent: notification.sent,
      notification,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
