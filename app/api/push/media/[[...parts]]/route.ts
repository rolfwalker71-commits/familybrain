import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { resolveDocumentAiIconPath } from "@/lib/paperless/document-icon";
import { resolveFinanceExpenseAiPath } from "@/lib/finance-brain/expense-image";
import { resolveMediaPath } from "@/lib/trips/cover";
import {
  verifyPushMediaQuery,
  verifyPushMediaToken,
} from "@/lib/push/signed-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ parts?: string[] }>;
};

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

async function servePushPng(fullPath: string): Promise<NextResponse> {
  const raw = fs.readFileSync(fullPath);
  // Android notification large-icon prefers a square PNG; upscale/pad to 512.
  const png = await sharp(raw)
    .rotate()
    .resize(512, 512, {
      fit: "cover",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png({ compressionLevel: 8 })
    .toBuffer();

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Session-less media for Web Push notification icon/image.
 * Supports:
 * - `/api/push/media/t/<exp>/<sig>/<base64url(path)>` (preferred, Android-safe)
 * - `/api/push/media?p=&e=&s=` (legacy)
 */
export async function GET(request: Request, context: Ctx) {
  const url = new URL(request.url);
  const { parts = [] } = await context.params;

  let verified:
    | { ok: true; path: string }
    | { ok: false; error: string };

  if (parts[0] === "t" && parts.length >= 4) {
    verified = verifyPushMediaToken({
      exp: parts[1] ?? null,
      sig: parts[2] ?? null,
      pathEncoded: parts[3] ?? null,
    });
  } else if (url.searchParams.has("p")) {
    verified = verifyPushMediaQuery({
      path: url.searchParams.get("p"),
      exp: url.searchParams.get("e"),
      sig: url.searchParams.get("s"),
    });
  } else {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 403 });
  }

  const full = resolveFilesystemPath(verified.path);
  if (!full || !fs.existsSync(full)) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  try {
    return await servePushPng(full);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[push/media]", message);
    return NextResponse.json({ error: "Bildfehler" }, { status: 500 });
  }
}
