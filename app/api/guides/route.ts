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
import { extractTextFromPdf } from "@/lib/guides/extract-pdf";
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

    const form = await request.formData();
    const file = form.get("file");
    const titleInput = String(form.get("title") || "").trim();
    const replaceExisting = form.get("replaceExisting") !== "false";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF-Datei fehlt." }, { status: 400 });
    }

    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Nur PDF-Dateien werden unterstützt." },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "PDF ist zu gross (max. 50 MB)." },
        { status: 400 }
      );
    }

    const filename = sanitizeFilename(file.name || "guide.pdf");
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

    const buffer = Buffer.from(await file.arrayBuffer());
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
