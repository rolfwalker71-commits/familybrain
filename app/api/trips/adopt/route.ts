import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAuth,
  requireTripAccess,
} from "@/lib/auth/current-user";
import {
  adoptDraftsToTrip,
  suggestFinanceFromIds,
} from "@/lib/trips/adopt";
import { serializeTripEvent } from "@/lib/trips/serialize-event";
import { coverPublicUrl } from "@/lib/trips/cover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DraftSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1).max(300),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  booking_reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  flight_number: z.string().nullable().optional(),
  cabin_class: z.string().nullable().optional(),
  departure_airport: z.string().nullable().optional(),
  arrival_airport: z.string().nullable().optional(),
  origin_place: z.string().nullable().optional(),
  destination_place: z.string().nullable().optional(),
  document_id: z.number().int().positive().nullable().optional(),
  travel_item_id: z.number().int().positive().nullable().optional(),
  guide_id: z.number().int().positive().nullable().optional(),
  note_id: z.string().nullable().optional(),
  source_excerpt: z.string().nullable().optional(),
});

const AdoptSchema = z.object({
  tripId: z.number().int().positive().nullable().optional(),
  newTripTitle: z.string().min(1).max(200).nullable().optional(),
  drafts: z.array(DraftSchema).min(1).max(80),
  finance: z
    .object({
      include: z.boolean(),
      amount: z.number().positive().optional(),
      currency: z.string().min(3).max(3).optional(),
      description: z.string().max(500).nullable().optional(),
      expenseDate: z.string().nullable().optional(),
      documentId: z.number().int().positive().nullable().optional(),
      linkToEventIndex: z.number().int().min(0).nullable().optional(),
    })
    .nullable()
    .optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const url = new URL(request.url);
    const documentIds = (url.searchParams.get("documentIds") || "")
      .split(",")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);
    const travelItemIds = (url.searchParams.get("travelItemIds") || "")
      .split(",")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);
    const fallbackTitle = url.searchParams.get("title");

    if (documentIds.length === 0 && travelItemIds.length === 0) {
      return NextResponse.json({ suggestion: null });
    }

    return NextResponse.json({
      suggestion: suggestFinanceFromIds({
        documentIds,
        travelItemIds,
        fallbackTitle,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const parsed = AdoptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }

    const { tripId, newTripTitle, drafts, finance } = parsed.data;

    if (tripId) {
      const tripAuth = await requireTripAccess(tripId);
      if (isAuthError(tripAuth)) return tripAuth;
    } else if (newTripTitle?.trim()) {
      if (!auth.isAdmin) {
        return NextResponse.json(
          { error: "Nur Admins können neue Reisen anlegen." },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Bitte Reise wählen oder neu anlegen." },
        { status: 400 }
      );
    }

    // Finance is opt-in only — never create expenses unless include === true.
    const financeInput =
      finance?.include === true
        ? {
            include: true as const,
            amount: finance.amount,
            currency: finance.currency,
            description: finance.description,
            expenseDate: finance.expenseDate,
            documentId: finance.documentId,
            linkToEventIndex: finance.linkToEventIndex,
          }
        : { include: false as const };

    const result = await adoptDraftsToTrip({
      tripId,
      newTripTitle,
      drafts,
      finance: financeInput,
    });

    return NextResponse.json({
      ok: true,
      trip: {
        ...result.trip,
        cover_url: coverPublicUrl(result.trip.cover_path),
      },
      events: result.events.map((e) => serializeTripEvent(e)),
      eventIds: result.events.map((e) => e.id),
      ledgerId: result.ledgerId,
      expenseId: result.expenseId,
      createdTrip: result.createdTrip,
      createdLedger: result.createdLedger,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[trips/adopt POST]", message);
    const status = message.includes("nicht gefunden")
      ? 404
      : message.includes("Bitte") || message.includes("fehlt")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
