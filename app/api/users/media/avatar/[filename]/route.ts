import { NextResponse } from "next/server";
import fs from "fs";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { resolveUserAvatarPath } from "@/lib/users/avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { filename } = await context.params;
  const full = resolveUserAvatarPath(filename);
  if (!full) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const buf = fs.readFileSync(full);
  const lower = filename.toLowerCase();
  const contentType = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return new NextResponse(buf, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
