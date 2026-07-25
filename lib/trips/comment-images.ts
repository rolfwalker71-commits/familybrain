import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getTripEventCommentImagesDir } from "@/lib/trips/paths";

export function ensureTripEventCommentImagesDir(): void {
  fs.mkdirSync(getTripEventCommentImagesDir(), { recursive: true });
}

export function tripEventCommentImagePublicUrl(
  filePath: string | null | undefined
): string | null {
  if (!filePath) return null;
  return `/api/trips/media/comment-image/${encodeURIComponent(
    path.basename(filePath)
  )}`;
}

export function resolveTripEventCommentImagePath(
  filename: string
): string | null {
  const safe = path.basename(filename);
  if (!safe || safe.includes("..")) return null;
  const full = path.join(getTripEventCommentImagesDir(), safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

export function contentTypeForTripEventCommentImage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

export function writeTripEventCommentImageFile(
  eventId: number,
  buffer: Buffer,
  originalFilename: string
): { fullPath: string; filename: string } {
  ensureTripEventCommentImagesDir();
  const safeBase = path
    .basename(originalFilename || "image.jpg")
    .replace(/[^\w.\-()+ ]+/g, "_")
    .slice(0, 80);
  const ext = path.extname(safeBase).toLowerCase() || ".jpg";
  const allowed = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  const useExt = allowed.has(ext) ? ext : ".jpg";
  const filename = `comment-${eventId}-${randomUUID().slice(0, 8)}${useExt}`;
  const fullPath = path.join(getTripEventCommentImagesDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  return { fullPath, filename };
}

export function unlinkTripEventCommentImageFile(
  filePath: string | null | undefined
): void {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}
