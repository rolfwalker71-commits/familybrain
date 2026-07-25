import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import {
  contentTypeForTripEventAttachment,
  resolveTripEventAttachmentPath,
} from "@/lib/trips/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ filename: string }> };

export async function GET(request: Request, context: Ctx) {
  const { filename } = await context.params;
  const full = resolveTripEventAttachmentPath(decodeURIComponent(filename));
  if (!full) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const base = path.basename(full);
  const row = getDb()
    .prepare(
      `SELECT te.trip_id AS trip_id, a.original_filename
       FROM trip_event_attachments a
       INNER JOIN trip_events te ON te.id = a.trip_event_id
       WHERE a.file_path LIKE ? OR a.file_path LIKE ?
       LIMIT 1`
    )
    .get(`%/${base}`, `%\\${base}`) as
    | { trip_id: number; original_filename: string | null }
    | undefined;
  if (!row) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const auth = await requireTripAccess(row.trip_id);
  if (isAuthError(auth)) return auth;

  const buffer = fs.readFileSync(full);
  const url = new URL(request.url);
  const asDownload = url.searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": contentTypeForTripEventAttachment(full),
    "Cache-Control": asDownload ? "no-store" : "private, max-age=600",
  };
  if (asDownload) {
    const suggested =
      url.searchParams.get("filename")?.trim() ||
      row.original_filename ||
      base;
    const safe = suggested.replace(/[\r\n"]/g, "_");
    headers["Content-Disposition"] = `attachment; filename="${safe}"`;
  } else {
    headers["Content-Disposition"] = "inline";
  }
  return new NextResponse(buffer, { headers });
}
