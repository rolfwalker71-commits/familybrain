import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { resolveDocumentAiIconPath } from "@/lib/paperless/document-icon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { filename } = await context.params;
  const full = resolveDocumentAiIconPath(decodeURIComponent(filename));
  if (!full) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const buffer = fs.readFileSync(full);
  const ext = path.extname(full).toLowerCase();
  const type =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
