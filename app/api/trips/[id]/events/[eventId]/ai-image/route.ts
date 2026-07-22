import { NextResponse } from "next/server";
import {
  clearEventAiImage,
  generateEventAiImage,
} from "@/lib/trips/event-image";
import { buildEventImagePrompt } from "@/lib/trips/event-image-prompt";
import { getEventAiImagePromptTemplate } from "@/lib/trips/event-image-settings";
import { getTripEventById } from "@/lib/trips/queries";
import { serializeTripEvent } from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

type Ctx = { params: Promise<{ id: string; eventId: string }> };

export async function GET(_request: Request, context: Ctx) {
  try {
    const { id: idRaw, eventId: eventIdRaw } = await context.params;
    const tripId = Number(idRaw);
    const eventId = Number(eventIdRaw);
    const existing = getTripEventById(eventId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json({ error: "Ereignis nicht gefunden" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      prompt:
        existing.ai_image_prompt ||
        buildEventImagePrompt(existing, getEventAiImagePromptTemplate()),
      hasImage: Boolean(existing.ai_image_path),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw, eventId: eventIdRaw } = await context.params;
    const tripId = Number(idRaw);
    const eventId = Number(eventIdRaw);
    const existing = getTripEventById(eventId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json({ error: "Ereignis nicht gefunden" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      prompt?: string;
      delete?: boolean;
    };

    if (body.delete) {
      const updated = clearEventAiImage(eventId);
      return NextResponse.json({ ok: true, event: serializeTripEvent(updated) });
    }

    const updated = await generateEventAiImage(eventId, body.prompt);
    return NextResponse.json({ ok: true, event: serializeTripEvent(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
