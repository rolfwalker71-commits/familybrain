import fs from "fs";
import sharp from "sharp";

/** Small thumbnails for ledger summary mail/PDF — keeps SMTP under size limits. */
export const LEDGER_SUMMARY_AI_THUMB_PX = 96;

export async function loadScaledJpeg(
  filePath: string | null | undefined,
  maxEdge = LEDGER_SUMMARY_AI_THUMB_PX
): Promise<Buffer | null> {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return await sharp(filePath)
      .rotate()
      .resize(maxEdge, maxEdge, {
        fit: "cover",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}
