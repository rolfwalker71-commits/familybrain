import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import {
  contentTypeForTripEventCommentImage,
  resolveTripEventCommentImagePath,
} from "@/lib/trips/comment-images";
import { resolveMediaPath } from "@/lib/trips/cover";
import { getTripById, listTripEvents } from "@/lib/trips/queries";
import { getActiveTripShareLinkByToken } from "@/lib/trips/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ token: string; kind: string; filename: string }>;
};

function mimeFor(file: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

export async function GET(_request: Request, context: Ctx) {
  const { token, kind, filename } = await context.params;
  const share = getActiveTripShareLinkByToken(token);
  if (!share) {
    return NextResponse.json({ error: "Ungültiger Share-Link" }, { status: 404 });
  }
  if (
    kind !== "cover" &&
    kind !== "aircraft" &&
    kind !== "map" &&
    kind !== "ai" &&
    kind !== "comment"
  ) {
    return NextResponse.json({ error: "Ungültiger Medientyp" }, { status: 400 });
  }
  const safe = path.basename(decodeURIComponent(filename));

  if (kind === "comment") {
    const full = resolveTripEventCommentImagePath(safe);
    if (!full) {
      return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
    }
    const base = path.basename(full);
    const row = getDb()
      .prepare(
        `SELECT te.trip_id AS trip_id
         FROM trip_event_comments c
         INNER JOIN trip_events te ON te.id = c.trip_event_id
         WHERE c.image_path LIKE ? OR c.image_path LIKE ?
         LIMIT 1`
      )
      .get(`%/${base}`, `%\\${base}`) as { trip_id: number } | undefined;
    if (!row || row.trip_id !== share.trip_id) {
      return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
    }
    const buffer = fs.readFileSync(full);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentTypeForTripEventCommentImage(full),
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const full = resolveMediaPath(kind, safe);
  if (!full) {
    return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
  }

  const trip = getTripById(share.trip_id);
  if (!trip) {
    return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
  }
  const base = path.basename(full);
  let allowed = false;
  if (kind === "cover" && trip.cover_path && path.basename(trip.cover_path) === base) {
    allowed = true;
  } else if (kind === "aircraft" || kind === "map" || kind === "ai") {
    const events = listTripEvents(share.trip_id);
    allowed = events.some((e) => {
      const p =
        kind === "aircraft"
          ? e.aircraft_image_path
          : kind === "map"
            ? e.map_image_path
            : e.ai_image_path;
      return p && path.basename(p) === base;
    });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const buffer = fs.readFileSync(full);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeFor(base),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
