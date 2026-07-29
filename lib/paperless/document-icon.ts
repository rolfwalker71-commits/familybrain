import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/client";
import { getDb } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { getDocumentById, type PaperlessDocumentRow } from "@/lib/db/queries";
import { getTripsDataRoot } from "@/lib/trips/paths";
import { nowIso } from "@/lib/utils/dates";

/** Document list thumbnails — gpt-image-1.5 for reliable color + prompt adherence. */
export const DOCUMENT_AI_ICON_MODEL = "gpt-image-1.5";

const DOCUMENT_AI_ICONS_ENABLED_KEY = "document_ai_icons_enabled";

/** Default off — enable in settings after sampling a few icons. */
export function isDocumentAiIconsEnabled(): boolean {
  const stored = getSetting(DOCUMENT_AI_ICONS_ENABLED_KEY);
  if (stored == null || stored === "") return false;
  return stored === "1" || stored.toLowerCase() === "true";
}

export function setDocumentAiIconsEnabled(enabled: boolean): void {
  setSetting(DOCUMENT_AI_ICONS_ENABLED_KEY, enabled ? "1" : "0");
}
export function getDocumentAiIconDir(): string {
  return path.join(getTripsDataRoot(), "document-ai-icons");
}

export function ensureDocumentAiIconDir(): void {
  fs.mkdirSync(getDocumentAiIconDir(), { recursive: true });
}

export function documentAiIconPublicUrl(
  aiIconPath: string | null | undefined
): string | null {
  if (!aiIconPath) return null;
  return `/api/documents/media/ai-icon/${encodeURIComponent(
    path.basename(aiIconPath)
  )}`;
}

export function resolveDocumentAiIconPath(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe || safe.includes("..")) return null;
  const full = path.join(getDocumentAiIconDir(), safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

function deleteIconFile(filePath: string | null | undefined) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

function clip(raw: string | null | undefined, max: number): string {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function buildDocumentAiIconPrompt(input: {
  title?: string | null;
  category?: string | null;
  correspondent?: string | null;
  documentType?: string | null;
  vendor?: string | null;
  product?: string | null;
  shortSummary?: string | null;
}): string {
  const category = clip(input.category, 40) || "Dokument";
  const title = clip(input.title, 80) || "Dokument";
  const correspondent = clip(input.correspondent, 60);
  const vendor = clip(input.vendor, 60);
  const docType = clip(input.documentType, 40);
  const product = clip(input.product, 40);
  const hint = clip(input.shortSummary, 100);

  // Prefer named organization for logo cues — title/summary often omit the firm.
  const brandParts: string[] = [];
  if (correspondent) brandParts.push(correspondent);
  if (vendor && vendor.toLowerCase() !== correspondent.toLowerCase()) {
    brandParts.push(vendor);
  }
  const brand = brandParts.join(" / ");

  const subjectParts = [
    `category «${category}»`,
    `title «${title}»`,
  ];
  if (brand) {
    subjectParts.push(
      `organization/brand «${brand}» (Paperless correspondent/vendor — primary logo cue)`
    );
  }
  if (docType) subjectParts.push(`type «${docType}»`);
  if (product) subjectParts.push(`product «${product}»`);
  if (hint) subjectParts.push(`context: ${hint}`);

  return [
    "Tiny square app icon illustration (not photorealistic) for a household document archive.",
    `Subject: ${subjectParts.join("; ")}.`,
    "Style: cheerful colorful flat illustration, bright varied hues matching the subject,",
    "solid pure white background (#FFFFFF) filling the entire square — never black, never dark, never gray.",
    "Centered recognizable symbol with soft shading, generous padding,",
    brand
      ? `Primary visual: if «${brand}» is a well-known company or brand, use their official logo as the main symbol when you can render it accurately; otherwise a generic subject-matched icon.`
      : "If the subject clearly identifies a well-known provider or brand (from title or context), prefer their official logo as the main symbol when accurate; otherwise a generic subject-matched icon.",
    "no text, no letters, no numbers, no watermarks, no receipt UI, no photorealism.",
    "Suitable as a 48px list thumbnail.",
  ].join(" ");
}

export function clearDocumentAiIcon(documentId: number): void {
  const db = getDb();
  const row = db
    .prepare(`SELECT ai_icon_path FROM paperless_documents WHERE id = ?`)
    .get(documentId) as { ai_icon_path: string | null } | undefined;
  if (!row) return;
  deleteIconFile(row.ai_icon_path);
  db.prepare(
    `UPDATE paperless_documents
     SET ai_icon_path = NULL, ai_icon_prompt = NULL, updated_at = ?
     WHERE id = ?`
  ).run(nowIso(), documentId);
}

export function setDocumentAiIcon(
  documentId: number,
  aiIconPath: string,
  aiIconPrompt: string
): PaperlessDocumentRow {
  const db = getDb();
  db.prepare(
    `UPDATE paperless_documents
     SET ai_icon_path = ?, ai_icon_prompt = ?, updated_at = ?
     WHERE id = ?`
  ).run(aiIconPath, aiIconPrompt, nowIso(), documentId);
  const row = db
    .prepare(`SELECT * FROM paperless_documents WHERE id = ?`)
    .get(documentId) as PaperlessDocumentRow | undefined;
  if (!row) throw new Error("Dokument nicht gefunden");
  return row;
}

export function listDocumentIdsMissingAiIcon(
  limit = 25,
  afterId = 0,
  onlyIds?: number[] | null
): number[] {
  return listDocumentIdsForAiIcon({
    limit,
    afterId,
    onlyIds,
    onlyMissing: true,
  });
}

/** Document ids for icon batch — optionally only missing, or force all selected. */
export function listDocumentIdsForAiIcon(input: {
  limit?: number;
  afterId?: number;
  onlyIds?: number[] | null;
  onlyMissing?: boolean;
}): number[] {
  const db = getDb();
  const limit = input.limit ?? 25;
  const afterId = input.afterId ?? 0;
  const onlyMissing = input.onlyMissing !== false;
  const onlyIds = input.onlyIds;

  if (onlyIds && onlyIds.length > 0) {
    const placeholders = onlyIds.map(() => "?").join(",");
    const missingSql = onlyMissing
      ? `AND (ai_icon_path IS NULL OR TRIM(ai_icon_path) = '')`
      : "";
    const rows = db
      .prepare(
        `SELECT id FROM paperless_documents
         WHERE id IN (${placeholders})
           AND COALESCE(sync_status, 'synced') != 'missing'
           ${missingSql}
           AND id > ?
         ORDER BY id
         LIMIT ?`
      )
      .all(...onlyIds, afterId, limit) as { id: number }[];
    return rows.map((r) => r.id);
  }

  const missingSql = onlyMissing
    ? `AND (d.ai_icon_path IS NULL OR TRIM(d.ai_icon_path) = '')`
    : "";
  const rows = db
    .prepare(
      `SELECT d.id
       FROM paperless_documents d
       INNER JOIN document_summaries s ON s.document_id = d.id
       WHERE COALESCE(d.sync_status, 'synced') != 'missing'
         AND s.analysis_status = 'completed'
         ${missingSql}
         AND d.id > ?
       ORDER BY d.id
       LIMIT ?`
    )
    .all(afterId, limit) as { id: number }[];
  return rows.map((r) => r.id);
}

export function countDocumentsMissingAiIcon(): number {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT COUNT(*) as c
         FROM paperless_documents d
         INNER JOIN document_summaries s ON s.document_id = d.id
         WHERE COALESCE(d.sync_status, 'synced') != 'missing'
           AND s.analysis_status = 'completed'
           AND (d.ai_icon_path IS NULL OR TRIM(d.ai_icon_path) = '')`
      )
      .get() as { c: number }
  ).c;
}

async function writeIconJpeg(
  documentId: number,
  source: Buffer
): Promise<string> {
  ensureDocumentAiIconDir();
  const jpeg = await sharp(source)
    .rotate()
    .resize(256, 256, { fit: "cover" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const filename = `doc-${documentId}-${randomUUID().slice(0, 8)}.jpg`;
  const fullPath = path.join(getDocumentAiIconDir(), filename);
  fs.writeFileSync(fullPath, jpeg);
  return fullPath;
}

/**
 * Generate (or force-regenerate) a small AI icon for a document.
 */
export async function generateDocumentAiIcon(
  documentId: number,
  options?: { force?: boolean }
): Promise<PaperlessDocumentRow> {
  if (!isDocumentAiIconsEnabled()) {
    throw new Error(
      "Dokument-AI-Icons sind deaktiviert (Einstellungen → Paperless)."
    );
  }
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt.");
  }
  const detail = getDocumentById(documentId);
  if (!detail) throw new Error("Dokument nicht gefunden");

  const existingPath = detail.document.ai_icon_path;
  if (existingPath && !options?.force) {
    return detail.document;
  }

  const finance = detail.financialItems[0] as
    | { vendor?: string | null }
    | undefined;
  const warranty = detail.warranties[0] as
    | { product_name?: string | null }
    | undefined;

  const prompt = buildDocumentAiIconPrompt({
    title: detail.document.title,
    category:
      typeof detail.summary?.category === "string"
        ? detail.summary.category
        : null,
    correspondent: detail.document.correspondent_name,
    documentType: detail.document.document_type_name,
    vendor: finance?.vendor ?? null,
    product: warranty?.product_name ?? null,
    shortSummary:
      typeof detail.summary?.short_summary === "string"
        ? detail.summary.short_summary
        : null,
  });

  const client = getOpenAIClient();
  const result = await client.images.generate({
    model: DOCUMENT_AI_ICON_MODEL,
    prompt,
    size: "1024x1024",
    quality: "low",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildgenerierung lieferte kein Bild.");

  const fullPath = await writeIconJpeg(
    documentId,
    Buffer.from(b64, "base64")
  );
  deleteIconFile(existingPath);
  const updated = setDocumentAiIcon(documentId, fullPath, prompt);
  try {
    const { notifyAiIconGenerated } = await import("@/lib/realtime/notify");
    notifyAiIconGenerated(documentId, { forced: Boolean(options?.force) });
  } catch {
    /* ignore */
  }
  return updated;
}

/** Best-effort: create icon only when missing (used after analysis). */
export async function ensureDocumentAiIconIfMissing(
  documentId: number
): Promise<void> {
  if (!isDocumentAiIconsEnabled()) return;
  const detail = getDocumentById(documentId);
  if (!detail?.document) return;
  if (detail.document.ai_icon_path) return;
  if (!hasOpenAIKey()) return;
  await generateDocumentAiIcon(documentId, { force: false });
}
