import { NextResponse } from "next/server";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import {
  canEditComment,
  MAX_COMMENT_BODY,
  MAX_COMMENT_IMAGE_BYTES,
  serializeTripEventComment,
} from "@/lib/trips/comments";
import {
  unlinkTripEventCommentImageFile,
  writeTripEventCommentImageFile,
} from "@/lib/trips/comment-images";
import {
  deleteTripEventComment,
  getTripEventById,
  getTripEventCommentById,
  updateTripEventComment,
} from "@/lib/trips/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ id: string; eventId: string; commentId: string }>;
};

export async function PATCH(request: Request, context: Ctx) {
  let writtenImage: string | null = null;
  try {
    const {
      id: idRaw,
      eventId: eventIdRaw,
      commentId: commentIdRaw,
    } = await context.params;
    const tripId = Number(idRaw);
    const eventId = Number(eventIdRaw);
    const commentId = Number(commentIdRaw);
    if (
      !Number.isInteger(tripId) ||
      tripId <= 0 ||
      !Number.isInteger(eventId) ||
      eventId <= 0 ||
      !Number.isInteger(commentId) ||
      commentId <= 0
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
    const existing = getTripEventCommentById(commentId);
    if (!existing || existing.trip_event_id !== eventId) {
      return NextResponse.json(
        { error: "Kommentar nicht gefunden" },
        { status: 404 }
      );
    }
    if (!canEditComment(existing, auth)) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let body: string | undefined;
    let removeImage = false;
    let imagePath: string | null | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const raw = form.get("body");
      if (typeof raw === "string") body = raw.trim();
      removeImage = form.get("removeImage") === "true" || form.get("removeImage") === "1";
      const file = form.get("image");
      if (file instanceof File && file.size > 0) {
        const type = (file.type || "").toLowerCase();
        const name = file.name || "image.jpg";
        const okType =
          type === "image/jpeg" ||
          type === "image/png" ||
          type === "image/webp" ||
          /\.(jpe?g|png|webp)$/i.test(name);
        if (!okType) {
          return NextResponse.json(
            { error: "Nur JPEG, PNG oder WebP erlaubt." },
            { status: 400 }
          );
        }
        if (file.size > MAX_COMMENT_IMAGE_BYTES) {
          return NextResponse.json(
            { error: "Bild ist zu gross (max. 8 MB)." },
            { status: 400 }
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        writtenImage = writeTripEventCommentImageFile(
          eventId,
          buffer,
          name
        ).fullPath;
        imagePath = writtenImage;
      } else if (removeImage) {
        imagePath = null;
      }
    } else {
      const json = (await request.json()) as {
        body?: string;
        removeImage?: boolean;
      };
      if (typeof json.body === "string") body = json.body.trim();
      if (json.removeImage) imagePath = null;
    }

    if (body !== undefined) {
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
    }

    const previousImage = existing.image_path;
    const updated = updateTripEventComment(commentId, {
      body,
      imagePath,
    });
    if (
      imagePath !== undefined &&
      previousImage &&
      previousImage !== updated.image_path
    ) {
      unlinkTripEventCommentImageFile(previousImage);
    }

    return NextResponse.json({
      ok: true,
      comment: serializeTripEventComment(updated, auth),
    });
  } catch (error) {
    if (writtenImage) unlinkTripEventCommentImageFile(writtenImage);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const {
      id: idRaw,
      eventId: eventIdRaw,
      commentId: commentIdRaw,
    } = await context.params;
    const tripId = Number(idRaw);
    const eventId = Number(eventIdRaw);
    const commentId = Number(commentIdRaw);
    if (
      !Number.isInteger(tripId) ||
      tripId <= 0 ||
      !Number.isInteger(eventId) ||
      eventId <= 0 ||
      !Number.isInteger(commentId) ||
      commentId <= 0
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
    const existing = getTripEventCommentById(commentId);
    if (!existing || existing.trip_event_id !== eventId) {
      return NextResponse.json(
        { error: "Kommentar nicht gefunden" },
        { status: 404 }
      );
    }
    if (!canEditComment(existing, auth)) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }
    const { filePath } = deleteTripEventComment(commentId);
    unlinkTripEventCommentImageFile(filePath);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
