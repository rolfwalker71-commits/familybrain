import { NextResponse } from "next/server";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import {
  authorNameFromAuth,
  MAX_COMMENT_BODY,
  MAX_COMMENT_IMAGE_BYTES,
  serializeTripEventComment,
} from "@/lib/trips/comments";
import {
  unlinkTripEventCommentImageFile,
  writeTripEventCommentImageFile,
} from "@/lib/trips/comment-images";
import { notifyTripEventComment } from "@/lib/trips/notify";
import {
  createTripEventComment,
  getTripEventById,
  listCommentsForEvent,
} from "@/lib/trips/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; eventId: string }> };

async function parseImageFromForm(
  form: FormData,
  eventId: number
): Promise<string | null> {
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  const type = (file.type || "").toLowerCase();
  const name = file.name || "image.jpg";
  const okType =
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp" ||
    /\.(jpe?g|png|webp)$/i.test(name);
  if (!okType) {
    throw Object.assign(new Error("Nur JPEG, PNG oder WebP erlaubt."), {
      status: 400,
    });
  }
  if (file.size > MAX_COMMENT_IMAGE_BYTES) {
    throw Object.assign(new Error("Bild ist zu gross (max. 8 MB)."), {
      status: 400,
    });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const { fullPath } = writeTripEventCommentImageFile(eventId, buffer, name);
  return fullPath;
}

export async function GET(_request: Request, context: Ctx) {
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
    const event = getTripEventById(eventId);
    if (!event || event.trip_id !== tripId) {
      return NextResponse.json(
        { error: "Ereignis nicht gefunden" },
        { status: 404 }
      );
    }
    const comments = listCommentsForEvent(eventId).map((c) =>
      serializeTripEventComment(c, auth)
    );
    return NextResponse.json({ comments });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  let writtenImage: string | null = null;
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
    const event = getTripEventById(eventId);
    if (!event || event.trip_id !== tripId) {
      return NextResponse.json(
        { error: "Ereignis nicht gefunden" },
        { status: 404 }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let body = "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const raw = form.get("body");
      body = typeof raw === "string" ? raw.trim() : "";
      writtenImage = await parseImageFromForm(form, eventId);
    } else {
      const json = (await request.json()) as { body?: string };
      body = typeof json.body === "string" ? json.body.trim() : "";
    }

    if (!body) {
      if (writtenImage) unlinkTripEventCommentImageFile(writtenImage);
      return NextResponse.json(
        { error: "Kommentartext fehlt." },
        { status: 400 }
      );
    }
    if (body.length > MAX_COMMENT_BODY) {
      if (writtenImage) unlinkTripEventCommentImageFile(writtenImage);
      return NextResponse.json(
        { error: `Kommentar max. ${MAX_COMMENT_BODY} Zeichen.` },
        { status: 400 }
      );
    }

    const comment = createTripEventComment(eventId, {
      userId: auth.userId,
      authorName: authorNameFromAuth(auth),
      body,
      imagePath: writtenImage,
    });
    // Always attempt mail; comment create must not fail if SMTP is down.
    try {
      await notifyTripEventComment(comment.id);
    } catch {
      // ignore mail transport errors
    }
    try {
      const { getTripById } = await import("@/lib/trips/queries");
      const trip = getTripById(tripId);
      const { notifyTripComment } = await import("@/lib/realtime/notify");
      notifyTripComment({
        tripId,
        eventId,
        tripTitle: trip?.title ?? null,
        eventTitle: event.title ?? null,
        authorName: comment.author_name,
        bodyPreview: body,
      });
    } catch {
      /* ignore realtime */
    }
    return NextResponse.json({
      ok: true,
      comment: serializeTripEventComment(comment, auth),
    });
  } catch (error) {
    if (writtenImage) unlinkTripEventCommentImageFile(writtenImage);
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof (error as { status: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
