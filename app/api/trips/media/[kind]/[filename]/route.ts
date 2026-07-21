import fs from "fs";
import { NextResponse } from "next/server";
import { resolveMediaPath } from "@/lib/trips/cover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string; filename: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { kind, filename } = await context.params;
  if (kind !== "cover" && kind !== "aircraft" && kind !== "map") {
    return NextResponse.json({ error: "Ungültig" }, { status: 400 });
  }
  const full = resolveMediaPath(kind, decodeURIComponent(filename));
  if (!full) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const buffer = fs.readFileSync(full);
  const lower = full.toLowerCase();
  const contentType = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
