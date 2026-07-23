import { NextResponse } from "next/server";
import {
  collectBalanceInputs,
  createFinanceLedger,
  getFinanceLedgerByTripId,
} from "@/lib/finance-brain/queries";
import { buildBalancePayload, serializeLedger } from "@/lib/finance-brain/serialize";
import { getTripById } from "@/lib/trips/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const tripId = Number(idRaw);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  if (!getTripById(tripId)) {
    return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
  }
  const ledger = getFinanceLedgerByTripId(tripId);
  if (!ledger) {
    return NextResponse.json({ ledger: null });
  }
  const balances = buildBalancePayload(collectBalanceInputs(ledger.id));
  return NextResponse.json({
    ledger: serializeLedger(ledger),
    ...balances,
  });
}

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const tripId = Number(idRaw);
    const trip = getTripById(tripId);
    if (!trip) {
      return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
    }
    const existing = getFinanceLedgerByTripId(tripId);
    if (existing) {
      return NextResponse.json({
        ok: true,
        ledger: serializeLedger(existing),
        created: false,
      });
    }
    const ledger = createFinanceLedger({
      title: trip.title,
      tripId,
      ledgerKind: "split",
    });
    return NextResponse.json({
      ok: true,
      ledger: serializeLedger(ledger),
      created: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
