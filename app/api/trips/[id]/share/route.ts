import { NextResponse } from "next/server";
import { z } from "zod";
import { getTripById } from "@/lib/trips/queries";
import {
  createTripShareLink,
  listTripShareLinks,
  revokeTripShareLink,
} from "@/lib/trips/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const PostSchema = z.object({
  label: z.string().max(120).nullable().optional(),
});

export async function GET(_request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const tripId = Number(idRaw);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  if (!getTripById(tripId)) {
    return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, links: listTripShareLinks(tripId) });
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const tripId = Number(idRaw);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    if (!getTripById(tripId)) {
      return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const link = createTripShareLink(tripId, parsed.data.label);
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const tripId = Number(idRaw);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const url = new URL(request.url);
    const shareId = Number(url.searchParams.get("shareId"));
    if (!Number.isInteger(shareId) || shareId <= 0) {
      return NextResponse.json({ error: "shareId fehlt" }, { status: 400 });
    }
    const link = revokeTripShareLink(tripId, shareId);
    if (!link) {
      return NextResponse.json({ error: "Link nicht gefunden" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
