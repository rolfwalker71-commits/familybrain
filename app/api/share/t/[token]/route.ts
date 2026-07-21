import { NextResponse } from "next/server";
import { getActiveTripShareLinkByToken } from "@/lib/trips/share";
import { serializeTripEvents } from "@/lib/trips/serialize-event";
import { listTripEvents } from "@/lib/trips/queries";
import { coverPublicUrl } from "@/lib/trips/cover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { token } = await context.params;
  const share = getActiveTripShareLinkByToken(token);
  if (!share) {
    return NextResponse.json(
      { error: "Share-Link ungültig oder abgelaufen." },
      { status: 404 }
    );
  }
  const events = serializeTripEvents(listTripEvents(share.trip_id)).map(
    (event) => ({
      ...event,
      // Hide internal paths on public payload
      aircraft_image_path: null,
      map_image_path: null,
      enrichment_json: null,
    })
  );
  return NextResponse.json({
    ok: true,
    trip: {
      ...share.trip,
      cover_path: null,
      cover_url: coverPublicUrl(share.trip.cover_path),
    },
    events,
    share: {
      token: share.token,
      label: share.label,
      created_at: share.created_at,
    },
  });
}
