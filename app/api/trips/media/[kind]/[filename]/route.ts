import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  contentTypeForExt,
  fileExtension,
} from "@/lib/trips/ai-images-export";
import { resolveMediaPath } from "@/lib/trips/cover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string; filename: string }> };

export async function GET(request: Request, context: Ctx) {
  const { kind, filename } = await context.params;
  if (kind !== "cover" && kind !== "aircraft" && kind !== "map" && kind !== "ai") {
    return NextResponse.json({ error: "Ungültig" }, { status: 400 });
  }
  const full = resolveMediaPath(kind, decodeURIComponent(filename));
  if (!full) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
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
