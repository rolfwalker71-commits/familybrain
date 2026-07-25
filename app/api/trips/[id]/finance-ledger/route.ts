import { NextResponse } from "next/server";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import {
  addFinanceLedgerMember,
  addFinanceLedgerMemberFromUser,
  collectCashbookTotals,
  createFinanceLedger,
  getFinanceLedgerByTripId,
  isNormalLedger,
} from "@/lib/finance-brain/queries";
import {
  buildLedgerBalancePayload,
  serializeLedger,
} from "@/lib/finance-brain/serialize";
import { buildTripCostSummary } from "@/lib/finance-brain/trip-cost";
import { getTripById, listTripTravelers } from "@/lib/trips/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const tripId = Number(idRaw);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const auth = await requireTripAccess(tripId);
  if (isAuthError(auth)) return auth;
  if (!getTripById(tripId)) {
    return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
  }
  const ledger = getFinanceLedgerByTripId(tripId);
  if (!ledger) {
    return NextResponse.json({ ledger: null });
  }
  if (isNormalLedger(ledger)) {
    return NextResponse.json({
      ledger: serializeLedger(ledger),
      balances: [],
      simplifiedDebts: [],
      minimalDebts: [],
      cashbook: collectCashbookTotals(ledger.id),
      costSummary: null,
    });
  }
  const balances = buildLedgerBalancePayload(ledger.id);
  return NextResponse.json({
    ledger: serializeLedger(ledger),
    cashbook: null,
    costSummary: buildTripCostSummary(ledger.id),
    ...balances,
  });
}

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const tripId = Number(idRaw);
    const auth = await requireTripAccess(tripId);
    if (isAuthError(auth)) return auth;
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
    const travelers = listTripTravelers(tripId);
    const ledger = createFinanceLedger({
      title: trip.title,
      tripId,
      ledgerKind: "split",
    });
    for (const t of travelers) {
      if (t.user_id) {
        addFinanceLedgerMemberFromUser(ledger.id, t.user_id);
      } else {
        addFinanceLedgerMember(ledger.id, {
          displayName: t.display_name,
          email: t.email,
        });
      }
    }
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
