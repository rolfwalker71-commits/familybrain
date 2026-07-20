import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  countIndexedKnowledgeGuides,
  listKnowledgeGuides,
} from "@/lib/db/queries";
import {
  importGuideFromPdfBuffer,
  MAX_GUIDE_UPLOAD_BYTES,
  sanitizeGuideFilename,
} from "@/lib/guides/import-guide";
import { ensureGuidesDirectory } from "@/lib/guides/storage";
import { checkQdrantConnection } from "@/lib/vectors/client";
import { hasOpenAIKey } from "@/lib/ai/client";

export const runtime = "nodejs";
export const maxDuration = 300;

type UploadPayload = {
  buffer: Buffer;
  filename: string;
  titleInput: string;
  replaceExisting: boolean;
};

async function readUploadPayload(request: Request): Promise<UploadPayload> {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  if (
    contentType.includes("application/pdf") ||
    contentType.includes("application/octet-stream")
  ) {
    const buffer = Buffer.from(await request.arrayBuffer());
    const filenameHeader = request.headers.get("x-guide-filename") || "guide.pdf";
    return {
      buffer,
      filename: sanitizeGuideFilename(filenameHeader),
      titleInput: String(request.headers.get("x-guide-title") || "").trim(),
      replaceExisting: request.headers.get("x-guide-replace") !== "false",
    };
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    const cause =
      error instanceof Error && "cause" in error
        ? String((error as Error & { cause?: unknown }).cause ?? "")
        : "";
    console.error("[guides] FormData parse failed:", error, cause);
    throw Object.assign(
      new Error(
        "Upload konnte nicht gelesen werden. Bitte den Chunk-Upload nutzen oder Proxy-Limit prüfen."
      ),
      { status: 413 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    throw Object.assign(new Error("PDF-Datei fehlt."), { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    throw Object.assign(new Error("Nur PDF-Dateien werden unterstützt."), {
      status: 400,
    });
  }

  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: sanitizeGuideFilename(file.name || "guide.pdf"),
    titleInput: String(form.get("title") || "").trim(),
    replaceExisting: form.get("replaceExisting") !== "false",
  };
}

export async function GET() {
  const qdrant = await checkQdrantConnection();
  return NextResponse.json({
    guides: listKnowledgeGuides(),
    indexedGuides: countIndexedKnowledgeGuides(),
    qdrant,
    hasOpenAIKey: hasOpenAIKey(),
  });
}

export async function POST(request: Request) {
  try {
    if (!hasOpenAIKey()) {
      return NextResponse.json(
        { error: "OpenAI API-Key fehlt. Bitte unter Einstellungen hinterlegen." },
        { status: 400 }
      );
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_GUIDE_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "PDF ist zu gross (max. 50 MB)." },
        { status: 400 }
      );
    }

    let payload: UploadPayload;
    try {
      payload = await readUploadPayload(request);
    } catch (error) {
      const status =
        error instanceof Error && "status" in error
          ? Number((error as Error & { status?: number }).status) || 500
          : 500;
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status });
    }

    console.info(
      `[guides] upload received filename=${payload.filename} bytes=${payload.buffer.length} contentLength=${contentLength || "n/a"}`
    );

    try {
      const result = await importGuideFromPdfBuffer({
        ...payload,
        expectedLength: contentLength > 0 ? contentLength : null,
      });
      return NextResponse.json({
        ok: true,
        guideId: result.guideId,
        replacedGuideId: result.replacedGuideId,
        chunkCount: result.chunkCount,
        pageCount: result.pageCount,
      });
    } catch (error) {
      const status =
        error instanceof Error && "status" in error
          ? Number((error as Error & { status?: number }).status) || 500
          : 500;
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Keep ensureGuidesDirectory referenced for tree-shaking clarity in Docker builds.
void ensureGuidesDirectory;
void fs;
void path;
