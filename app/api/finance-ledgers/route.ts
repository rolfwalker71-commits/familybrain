import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createFinanceLedger,
  listFinanceLedgers,
} from "@/lib/finance-brain/queries";
import { serializeLedger } from "@/lib/finance-brain/serialize";
import { COMMON_CURRENCIES, LEDGER_KINDS } from "@/lib/finance-brain/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  baseCurrency: z.string().min(3).max(3).optional(),
  tripId: z.number().int().positive().nullable().optional(),
  memberNames: z.array(z.string().min(1).max(80)).optional(),
  ledgerKind: z.enum(LEDGER_KINDS).optional(),
});

export async function GET() {
  const ledgers = listFinanceLedgers().map(serializeLedger);
  return NextResponse.json({ ledgers });
}

export async function POST(request: Request) {
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
