import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveDocumentAiIconPath } from "@/lib/paperless/document-icon";
import { resolveFinanceExpenseAiPath } from "@/lib/finance-brain/expense-image";
import { resolveMediaPath } from "@/lib/trips/cover";
import { verifyPushMediaQuery } from "@/lib/push/signed-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function resolveFilesystemPath(mediaPath: string): string | null {
  const base = path.basename(mediaPath);
  if (!base || base.includes("..")) return null;

  if (mediaPath.startsWith("/api/documents/media/ai-icon/")) {
    return resolveDocumentAiIconPath(base);
  }
  if (mediaPath.startsWith("/api/trips/media/ai/")) {
    return resolveMediaPath("ai", base);
  }
  if (mediaPath.startsWith("/api/trips/media/cover/")) {
    return resolveMediaPath("cover", base);
  }
  if (mediaPath.startsWith("/api/finance-ledgers/media/ai/")) {
    return resolveFinanceExpenseAiPath(base);
  }
  return null;
}

/**
 * Session-less media for Web Push notification icon/image (HMAC-signed query).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const verified = verifyPushMediaQuery({
    path: url.searchParams.get("p"),
    exp: url.searchParams.get("e"),
    sig: url.searchParams.get("s"),
  });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 403 });
  }

  const full = resolveFilesystemPath(verified.path);
  if (!full || !fs.existsSync(full)) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const buffer = fs.readFileSync(full);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentTypeFor(full),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
