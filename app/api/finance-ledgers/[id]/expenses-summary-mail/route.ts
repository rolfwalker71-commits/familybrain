import { NextResponse } from "next/server";
import {
  notifyFailed,
  notifyLedgerExpensesSummary,
} from "@/lib/finance-brain/notify";
import { getFinanceLedgerById } from "@/lib/finance-brain/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const ledgerId = Number(idRaw);
    if (!getFinanceLedgerById(ledgerId)) {
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    const notification = await notifyLedgerExpensesSummary(ledgerId);
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
