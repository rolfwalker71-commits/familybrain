import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { resolveMediaPath } from "@/lib/trips/cover";
import { getActiveTripShareLinkByToken } from "@/lib/trips/share";
import { getTripById, listTripEvents } from "@/lib/trips/queries";

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
  if (kind !== "cover" && kind !== "aircraft" && kind !== "map") {
    return NextResponse.json({ error: "Ungültiger Medientyp" }, { status: 400 });
  }
  const safe = path.basename(filename);
  const full = resolveMediaPath(kind, safe);
  if (!full) {
    return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
  }

  // Ensure media belongs to this trip.
  const trip = getTripById(share.trip_id);
  if (!trip) {
    return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
  }
  const base = path.basename(full);
  let allowed = false;
  if (kind === "cover" && trip.cover_path && path.basename(trip.cover_path) === base) {
    allowed = true;
  } else if (kind === "aircraft" || kind === "map") {
    const events = listTripEvents(share.trip_id);
    allowed = events.some((e) => {
      const p = kind === "aircraft" ? e.aircraft_image_path : e.map_image_path;
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
