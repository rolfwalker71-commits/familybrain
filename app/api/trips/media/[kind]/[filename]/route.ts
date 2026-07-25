import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import {
  contentTypeForExt,
  fileExtension,
} from "@/lib/trips/ai-images-export";
import { resolveMediaPath } from "@/lib/trips/cover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string; filename: string }> };

function resolveTripIdForMedia(
  kind: "cover" | "aircraft" | "map" | "ai",
  base: string
): number | null {
  const db = getDb();
  if (kind === "cover") {
    const row = db
      .prepare(
        `SELECT id FROM trips
         WHERE cover_path LIKE ? OR cover_path LIKE ?
         LIMIT 1`
      )
      .get(`%/${base}`, `%\\${base}`) as { id: number } | undefined;
    return row?.id ?? null;
  }
  const column =
    kind === "aircraft"
      ? "aircraft_image_path"
      : kind === "map"
        ? "map_image_path"
        : "ai_image_path";
  const row = db
    .prepare(
      `SELECT trip_id AS id FROM trip_events
       WHERE ${column} LIKE ? OR ${column} LIKE ?
       LIMIT 1`
    )
    .get(`%/${base}`, `%\\${base}`) as { id: number } | undefined;
  return row?.id ?? null;
}

export async function GET(request: Request, context: Ctx) {
  const { kind, filename } = await context.params;
  if (kind !== "cover" && kind !== "aircraft" && kind !== "map" && kind !== "ai") {
    return NextResponse.json({ error: "Ungültig" }, { status: 400 });
  }
  const full = resolveMediaPath(kind, decodeURIComponent(filename));
  if (!full) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const base = path.basename(full);
  const tripId = resolveTripIdForMedia(kind, base);
  if (!tripId) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const auth = await requireTripAccess(tripId);
  if (isAuthError(auth)) return auth;

  const buffer = fs.readFileSync(full);
  const ext = fileExtension(full);
  const contentType = contentTypeForExt(ext);
  const url = new URL(request.url);
  const asDownload = url.searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": asDownload ? "no-store" : "public, max-age=86400",
  };
  if (asDownload) {
    const suggested =
      url.searchParams.get("filename")?.trim() || path.basename(full);
    const safe = suggested.replace(/[\r\n"]/g, "_");
    headers["Content-Disposition"] = `attachment; filename="${safe}"`;
  }
  return new NextResponse(buffer, { headers });
}
