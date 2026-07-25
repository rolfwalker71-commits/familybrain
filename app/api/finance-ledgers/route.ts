import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAdmin,
  requireAuth,
} from "@/lib/auth/current-user";
import {
  createFinanceLedger,
  listFinanceLedgers,
} from "@/lib/finance-brain/queries";
import { serializeLedger } from "@/lib/finance-brain/serialize";
import { COMMON_CURRENCIES, LEDGER_KINDS } from "@/lib/finance-brain/constants";
import { listUserLedgerIds } from "@/lib/users/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  baseCurrency: z.string().min(3).max(3).optional(),
  tripId: z.number().int().positive().nullable().optional(),
  memberNames: z.array(z.string().min(1).max(80)).optional(),
  memberUserIds: z.array(z.number().int().positive()).optional(),
  ledgerKind: z.enum(LEDGER_KINDS).optional(),
});

export async function GET() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;
    let ledgers = listFinanceLedgers();
    if (!auth.isAdmin && auth.userId) {
      const allowed = new Set(listUserLedgerIds(auth.userId));
      ledgers = ledgers.filter((l) => allowed.has(l.id));
    }
    return NextResponse.json({ ledgers: ledgers.map(serializeLedger) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[finance-ledgers GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const currency = parsed.data.baseCurrency?.toUpperCase();
    if (currency && !COMMON_CURRENCIES.includes(currency as never)) {
      return NextResponse.json(
        { error: "Unbekannte Währung" },
        { status: 400 }
      );
    }
    const ledger = createFinanceLedger({
      title: parsed.data.title,
      baseCurrency: currency,
      tripId: parsed.data.tripId ?? null,
      memberNames:
        parsed.data.ledgerKind === "normal"
          ? undefined
          : parsed.data.memberNames,
      memberUserIds:
        parsed.data.ledgerKind === "normal"
          ? undefined
          : parsed.data.memberUserIds,
      ledgerKind: parsed.data.ledgerKind ?? "split",
    });
    return NextResponse.json({
      ok: true,
      ledger: serializeLedger(ledger),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
