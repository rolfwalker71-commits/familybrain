import { NextResponse } from "next/server";
import { getActiveTripShareLinkByToken } from "@/lib/trips/share";
import { rewriteTripMediaUrlForShare } from "@/lib/trips/share-media";
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
      aircraft_image_path: null,
      map_image_path: null,
      aircraft_image_url: rewriteTripMediaUrlForShare(
        event.aircraft_image_url,
        token
      ),
      map_image_url: rewriteTripMediaUrlForShare(event.map_image_url, token),
    })
  );
  return NextResponse.json({
    ok: true,
    trip: {
      ...share.trip,
      cover_path: null,
      cover_url: rewriteTripMediaUrlForShare(
        coverPublicUrl(share.trip.cover_path),
        token
      ),
    },
    events,
    share: {
      token: share.token,
      label: share.label,
      created_at: share.created_at,
    },
  });
}
