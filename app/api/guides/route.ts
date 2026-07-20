import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import {
  countIndexedKnowledgeGuides,
  createKnowledgeGuide,
  findKnowledgeGuideByFilename,
  findKnowledgeGuideByTitle,
  listKnowledgeGuides,
  updateKnowledgeGuideFilePath,
} from "@/lib/db/queries";
import { removeKnowledgeGuideFully } from "@/lib/guides/delete-guide";
import {
  diagnosePdfBuffer,
  extractTextFromPdf,
} from "@/lib/guides/extract-pdf";
import { guideFilePath, ensureGuidesDirectory } from "@/lib/guides/storage";
import { indexKnowledgeGuide } from "@/lib/vectors/index-guide";
import { checkQdrantConnection } from "@/lib/vectors/client";
import { hasOpenAIKey } from "@/lib/ai/client";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

type UploadPayload = {
  buffer: Buffer;
  filename: string;
  titleInput: string;
  replaceExisting: boolean;
};

async function readUploadPayload(request: Request): Promise<UploadPayload> {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  // Prefer raw PDF body — more reliable behind reverse proxies than multipart FormData.
  if (
    contentType.includes("application/pdf") ||
    contentType.includes("application/octet-stream")
  ) {
    const buffer = Buffer.from(await request.arrayBuffer());
    const filenameHeader = request.headers.get("x-guide-filename") || "guide.pdf";
    return {
      buffer,
      filename: sanitizeFilename(filenameHeader),
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
        "Upload konnte nicht gelesen werden. Bitte Seite neu laden und erneut versuchen (raw PDF Upload)."
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
    filename: sanitizeFilename(file.name || "guide.pdf"),
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
    if (contentLength > MAX_UPLOAD_BYTES) {
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

    const { buffer, filename, titleInput, replaceExisting } = payload;

    if (buffer.length === 0) {
      return NextResponse.json({ error: "PDF-Datei fehlt." }, { status: 400 });
    }

    if (buffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "PDF ist zu gross (max. 50 MB)." },
        { status: 400 }
      );
    }

    console.info(
      `[guides] upload received filename=${filename} bytes=${buffer.length} contentLength=${contentLength || "n/a"}`
    );

    const diagnosis = diagnosePdfBuffer(
      buffer,
      contentLength > 0 ? contentLength : null
    );
    if (diagnosis) {
      return NextResponse.json({ error: diagnosis }, { status: 400 });
    }

    const title =
      titleInput ||
      filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() ||
      "Guide";

    let replacedGuideId: number | null = null;
    if (replaceExisting) {
      const existing =
        findKnowledgeGuideByFilename(filename) ??
        (titleInput ? findKnowledgeGuideByTitle(title) : null);
      if (existing) {
        await removeKnowledgeGuideFully(existing.id);
        replacedGuideId = existing.id;
      }
    }

    const fileHash = createHash("sha256").update(buffer).digest("hex");

    ensureGuidesDirectory();
    const tempPath = path.join(
      ensureGuidesDirectory(),
      `tmp-${Date.now()}-${filename}`
    );
    fs.writeFileSync(tempPath, buffer);

    let extracted;
    try {
      extracted = await extractTextFromPdf(tempPath);
    } finally {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        /* ignore */
      }
    }

    if (!extracted.text.trim()) {
      return NextResponse.json(
        {
          error:
            "Im PDF wurde kein Text gefunden. Scans oder bildlastige PDFs werden aktuell nicht unterstützt.",
        },
        { status: 400 }
      );
    }

    const guideId = createKnowledgeGuide({
      title,
      filename,
      filePath: "",
      fileHash,
      pageCount: extracted.pageCount || null,
      extractedText: extracted.text,
    });

    const finalPath = guideFilePath(guideId, filename);
    fs.writeFileSync(finalPath, buffer);
    updateKnowledgeGuideFilePath(guideId, finalPath);

    const indexResult = await indexKnowledgeGuide(guideId);

    return NextResponse.json({
      ok: true,
      guideId,
      replacedGuideId,
      chunkCount: indexResult.chunkCount,
      pageCount: extracted.pageCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
