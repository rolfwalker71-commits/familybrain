import { NextResponse } from "next/server";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import {
  unlinkTripEventAttachmentFile,
  writeTripEventAttachmentFile,
} from "@/lib/trips/attachments";
import {
  createTripEventAttachment,
  deleteTripEventAttachment,
  getTripEventAttachmentById,
  getTripEventById,
} from "@/lib/trips/queries";
import { serializeTripEvent } from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; eventId: string }> };

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw, eventId: eventIdRaw } = await context.params;
    const tripId = Number(idRaw);
    const eventId = Number(eventIdRaw);
    if (
      !Number.isInteger(tripId) ||
      tripId <= 0 ||
      !Number.isInteger(eventId) ||
      eventId <= 0
    ) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const auth = await requireTripAccess(tripId);
    if (isAuthError(auth)) return auth;
    const existing = getTripEventById(eventId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json(
        { error: "Ereignis nicht gefunden" },
        { status: 404 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "PDF-Datei fehlt (Feld «file»)." },
        { status: 400 }
      );
    }
    const name = file.name || "beleg.pdf";
    const lower = name.toLowerCase();
    const type = (file.type || "").toLowerCase();
    if (!lower.endsWith(".pdf") && type !== "application/pdf") {
      return NextResponse.json(
        { error: "Nur PDF-Dateien sind erlaubt." },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "PDF ist zu gross (max. 40 MB)." },
        { status: 400 }
      );
    }

    const titleRaw = form.get("title");
    const title =
      typeof titleRaw === "string" && titleRaw.trim()
        ? titleRaw.trim()
        : name.replace(/\.pdf$/i, "");

    const buffer = Buffer.from(await file.arrayBuffer());
    const { fullPath } = writeTripEventAttachmentFile(eventId, buffer, name);
    try {
      createTripEventAttachment(eventId, {
        title,
        originalFilename: name,
        filePath: fullPath,
        mimeType: "application/pdf",
        byteSize: buffer.length,
      });
    } catch (error) {
      unlinkTripEventAttachmentFile(fullPath);
      throw error;
    }

    const event = getTripEventById(eventId)!;
    return NextResponse.json({
      ok: true,
      event: serializeTripEvent(event),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const { id: idRaw, eventId: eventIdRaw } = await context.params;
    const tripId = Number(idRaw);
    const eventId = Number(eventIdRaw);
    if (
      !Number.isInteger(tripId) ||
      tripId <= 0 ||
      !Number.isInteger(eventId) ||
      eventId <= 0
    ) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const auth = await requireTripAccess(tripId);
    if (isAuthError(auth)) return auth;
    const existing = getTripEventById(eventId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json(
        { error: "Ereignis nicht gefunden" },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const attachmentId = Number(url.searchParams.get("attachmentId"));
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const attachment = getTripEventAttachmentById(attachmentId);
    if (!attachment || attachment.trip_event_id !== eventId) {
      return NextResponse.json(
        { error: "Anhang nicht gefunden" },
        { status: 404 }
      );
    }

    const { event, filePath } = deleteTripEventAttachment(attachmentId);
    unlinkTripEventAttachmentFile(filePath);
    return NextResponse.json({
      ok: true,
      event: serializeTripEvent(event),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
