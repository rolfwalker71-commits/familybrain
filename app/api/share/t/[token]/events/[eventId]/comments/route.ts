import { NextResponse } from "next/server";
import { serializeTripEventComment } from "@/lib/trips/comments";
import { getTripEventById, listCommentsForEvent } from "@/lib/trips/queries";
import { getActiveTripShareLinkByToken } from "@/lib/trips/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; eventId: string }> };

export async function GET(_request: Request, context: Ctx) {
  try {
    const { token, eventId: eventIdRaw } = await context.params;
    const share = getActiveTripShareLinkByToken(token);
    if (!share) {
      return NextResponse.json(
        { error: "Ungültiger Share-Link" },
        { status: 404 }
      );
    }
    const eventId = Number(eventIdRaw);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const event = getTripEventById(eventId);
    if (!event || event.trip_id !== share.trip_id) {
      return NextResponse.json(
        { error: "Ereignis nicht gefunden" },
        { status: 404 }
      );
    }
    const comments = listCommentsForEvent(eventId).map((c) =>
      serializeTripEventComment(c, null, { shareToken: token })
    );
    return NextResponse.json({ comments });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
