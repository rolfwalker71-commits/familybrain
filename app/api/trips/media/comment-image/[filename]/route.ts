import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import {
  contentTypeForTripEventCommentImage,
  resolveTripEventCommentImagePath,
} from "@/lib/trips/comment-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { filename } = await context.params;
  const full = resolveTripEventCommentImagePath(decodeURIComponent(filename));
  if (!full) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
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
  if (!row) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const auth = await requireTripAccess(row.trip_id);
  if (isAuthError(auth)) return auth;

  const buffer = fs.readFileSync(full);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentTypeForTripEventCommentImage(full),
      "Cache-Control": "private, max-age=600",
    },
  });
}
