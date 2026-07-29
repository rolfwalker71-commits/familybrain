import { NextResponse } from "next/server";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import {
  authorNameFromAuth,
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
} from "@/lib/trips/queries";
import { fetchStaticMapPng } from "@/lib/trips/static-map";
import { resolveWeatherMapZoom } from "@/lib/trips/map-context";
import {
  fetchCurrentWeather,
  formatWeatherCommentBody,
} from "@/lib/trips/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; eventId: string }> };

function parseCoord(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw Object.assign(new Error(`${label} ungültig.`), { status: 400 });
  }
  return n;
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

    const json = (await request.json()) as {
      lat?: unknown;
      lon?: unknown;
      accuracy?: unknown;
    };
    const lat = parseCoord(json.lat, "Breitengrad");
    const lon = parseCoord(json.lon, "Längengrad");
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json(
        { error: "Koordinaten ausserhalb des gültigen Bereichs." },
        { status: 400 }
      );
    }
    const accuracyRaw =
      json.accuracy === undefined || json.accuracy === null
        ? null
        : Number(json.accuracy);
    const accuracyM =
      accuracyRaw != null && Number.isFinite(accuracyRaw) ? accuracyRaw : null;

    const weather = await fetchCurrentWeather(lat, lon);
    const body = formatWeatherCommentBody({
      weather,
      lat,
      lon,
      accuracyM,
    });

    const { zoom } = await resolveWeatherMapZoom(lat, lon);
    const mapPng = await fetchStaticMapPng({
      lat,
      lon,
      zoom,
      withMarker: true,
    });
    if (mapPng) {
      const { fullPath } = writeTripEventCommentImageFile(
        eventId,
        mapPng,
        "weather-map.png"
      );
      writtenImage = fullPath;
    }

    const comment = createTripEventComment(eventId, {
      userId: auth.userId,
      authorName: authorNameFromAuth(auth),
      body,
      imagePath: writtenImage,
    });

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
      /* ignore */
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
