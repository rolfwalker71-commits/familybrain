import { NextResponse } from "next/server";
import fs from "fs";
import {
  assembleGuideUploadParts,
  cleanupGuideUpload,
  createGuideUploadId,
  GUIDE_UPLOAD_CHUNK_BYTES,
  guideUploadPartPath,
  importGuideFromPdfBuffer,
  isValidGuideUploadId,
  MAX_GUIDE_UPLOAD_BYTES,
  sanitizeGuideFilename,
} from "@/lib/guides/import-guide";
import { hasOpenAIKey } from "@/lib/ai/client";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Chunked guide upload to bypass ~10 MB reverse-proxy body cuts.
 *
 * 1) POST JSON → { uploadId, chunkBytes }
 * 2) POST octet-stream chunks with X-Guide-Upload-Id (+ chunk headers)
 * 3) Last chunk triggers import + indexing
 */
export async function GET() {
  return NextResponse.json({
    chunkBytes: GUIDE_UPLOAD_CHUNK_BYTES,
    maxBytes: MAX_GUIDE_UPLOAD_BYTES,
    hasOpenAIKey: hasOpenAIKey(),
  });
}

async function handleInit(request: Request) {
  let requestedChunks: number | null = null;
  let totalBytes: number | null = null;
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      chunkCount?: number;
      totalBytes?: number;
    } | null;
    if (body?.chunkCount) requestedChunks = Number(body.chunkCount);
    if (body?.totalBytes) totalBytes = Number(body.totalBytes);
  }

  if (totalBytes != null && totalBytes > MAX_GUIDE_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "PDF ist zu gross (max. 50 MB)." },
      { status: 400 }
    );
  }

  const uploadId = createGuideUploadId();
  return NextResponse.json({
    ok: true,
    uploadId,
    chunkBytes: GUIDE_UPLOAD_CHUNK_BYTES,
    maxBytes: MAX_GUIDE_UPLOAD_BYTES,
    chunkCount: requestedChunks,
  });
}

async function handleChunk(request: Request) {
  const uploadId = String(request.headers.get("x-guide-upload-id") || "");
  const chunkIndex = Number(request.headers.get("x-guide-chunk-index") || "-1");
  const chunkCount = Number(request.headers.get("x-guide-chunk-count") || "0");
  const totalBytes = Number(request.headers.get("x-guide-total-bytes") || "0");
  const filename = sanitizeGuideFilename(
    request.headers.get("x-guide-filename") || "guide.pdf"
  );
  const titleInput = String(request.headers.get("x-guide-title") || "").trim();
  const replaceExisting = request.headers.get("x-guide-replace") !== "false";

  if (!isValidGuideUploadId(uploadId)) {
    return NextResponse.json({ error: "Ungültige Upload-ID." }, { status: 400 });
  }
  if (
    !Number.isInteger(chunkIndex) ||
    chunkIndex < 0 ||
    !Number.isInteger(chunkCount) ||
    chunkCount < 1 ||
    chunkIndex >= chunkCount
  ) {
    return NextResponse.json({ error: "Ungültige Chunk-Angaben." }, { status: 400 });
  }
  if (totalBytes > MAX_GUIDE_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "PDF ist zu gross (max. 50 MB)." },
      { status: 400 }
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > GUIDE_UPLOAD_CHUNK_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Chunk ist zu gross." }, { status: 400 });
  }

  const chunkBuffer = Buffer.from(await request.arrayBuffer());
  if (chunkBuffer.length === 0) {
    return NextResponse.json({ error: "Leerer Chunk." }, { status: 400 });
  }
  if (contentLength > 0 && chunkBuffer.length !== contentLength) {
    cleanupGuideUpload(uploadId, chunkCount);
    return NextResponse.json(
      {
        error: `Chunk ${chunkIndex + 1}/${chunkCount} unvollständig: ${chunkBuffer.length} von ${contentLength} Bytes.`,
      },
      { status: 400 }
    );
  }

  fs.writeFileSync(guideUploadPartPath(uploadId, chunkIndex), chunkBuffer);
  console.info(
    `[guides] chunk upload id=${uploadId} ${chunkIndex + 1}/${chunkCount} bytes=${chunkBuffer.length}`
  );

  const isLast = chunkIndex === chunkCount - 1;
  if (!isLast) {
    return NextResponse.json({
      ok: true,
      uploadId,
      chunkIndex,
      received: true,
    });
  }

  try {
    const buffer = assembleGuideUploadParts(uploadId, chunkCount, totalBytes);
    console.info(
      `[guides] upload assembled id=${uploadId} filename=${filename} bytes=${buffer.length}`
    );

    const result = await importGuideFromPdfBuffer({
      buffer,
      filename,
      titleInput,
      replaceExisting,
      expectedLength: totalBytes > 0 ? totalBytes : buffer.length,
    });

    cleanupGuideUpload(uploadId, chunkCount);

    return NextResponse.json({
      ok: true,
      guideId: result.guideId,
      replacedGuideId: result.replacedGuideId,
      chunkCount: result.chunkCount,
      pageCount: result.pageCount,
    });
  } catch (error) {
    cleanupGuideUpload(uploadId, chunkCount);
    const status =
      error instanceof Error && "status" in error
        ? Number((error as Error & { status?: number }).status) || 500
        : 500;
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    if (!hasOpenAIKey()) {
      return NextResponse.json(
        { error: "OpenAI API-Key fehlt. Bitte unter Einstellungen hinterlegen." },
        { status: 400 }
      );
    }

    const uploadId = request.headers.get("x-guide-upload-id");
    if (uploadId) {
      return await handleChunk(request);
    }
    return await handleInit(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
