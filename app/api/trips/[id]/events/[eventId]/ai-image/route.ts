import fs from "fs";
import { NextResponse } from "next/server";
import {
  contentTypeForExt,
  downloadNameForEventAi,
  fileExtension,
} from "@/lib/trips/ai-images-export";
import {
  clearEventAiImage,
  generateEventAiImage,
  saveEventAiImageUpload,
} from "@/lib/trips/event-image";
import { buildEventImagePrompt } from "@/lib/trips/event-image-prompt";
import { getEventAiImagePromptTemplate } from "@/lib/trips/event-image-settings";
import { getTripEventById } from "@/lib/trips/queries";
import { serializeTripEvent } from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

type Ctx = { params: Promise<{ id: string; eventId: string }> };

export async function GET(request: Request, context: Ctx) {
  try {
    const { id: idRaw, eventId: eventIdRaw } = await context.params;
    const tripId = Number(idRaw);
    const eventId = Number(eventIdRaw);
    const existing = getTripEventById(eventId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json({ error: "Ereignis nicht gefunden" }, { status: 404 });
    }

    const url = new URL(request.url);
    if (url.searchParams.get("download") === "1") {
      if (!existing.ai_image_path || !fs.existsSync(existing.ai_image_path)) {
        return NextResponse.json({ error: "Kein Bild vorhanden" }, { status: 404 });
      }
      const buffer = fs.readFileSync(existing.ai_image_path);
      const ext = fileExtension(existing.ai_image_path);
      const filename = downloadNameForEventAi(existing);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentTypeForExt(ext),
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      prompt: buildEventImagePrompt(
        existing,
        getEventAiImagePromptTemplate()
      ),
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

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Datei fehlt" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const updated = await saveEventAiImageUpload(
        eventId,
        buffer,
        file.type || "image/jpeg"
      );
      return NextResponse.json({ ok: true, event: serializeTripEvent(updated) });
    }

    const body = (await request.json().catch(() => ({}))) as {
      prompt?: string;
      delete?: boolean;
      useSettings?: boolean;
    };

    if (body.delete) {
      const updated = clearEventAiImage(eventId);
      return NextResponse.json({ ok: true, event: serializeTripEvent(updated) });
    }

    // Empty / settings path: always rebuild from current settings + fresh event.
    const useCustom =
      body.useSettings !== true &&
      typeof body.prompt === "string" &&
      body.prompt.trim().length > 0;
    const updated = await generateEventAiImage(
      eventId,
      useCustom ? body.prompt : undefined
    );
    return NextResponse.json({ ok: true, event: serializeTripEvent(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
