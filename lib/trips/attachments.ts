import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  getTripEventAttachmentsDir,
} from "@/lib/trips/paths";

export function ensureTripEventAttachmentsDir(): void {
  fs.mkdirSync(getTripEventAttachmentsDir(), { recursive: true });
}

export function tripEventAttachmentPublicUrl(
  filePath: string | null | undefined
): string | null {
  if (!filePath) return null;
  return `/api/trips/media/attachment/${encodeURIComponent(
    path.basename(filePath)
  )}`;
}

export function resolveTripEventAttachmentPath(
  filename: string
): string | null {
  const safe = path.basename(filename);
  if (!safe || safe.includes("..")) return null;
  const full = path.join(getTripEventAttachmentsDir(), safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

export function contentTypeForTripEventAttachment(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

export function writeTripEventAttachmentFile(
  eventId: number,
  buffer: Buffer,
  originalFilename: string
): { fullPath: string; filename: string } {
  ensureTripEventAttachmentsDir();
  const safeBase = path
    .basename(originalFilename || "beleg.pdf")
    .replace(/[^\w.\-()+ ]+/g, "_")
    .slice(0, 80);
  const ext = path.extname(safeBase).toLowerCase() || ".pdf";
  const filename = `event-${eventId}-${randomUUID().slice(0, 8)}${ext}`;
  const fullPath = path.join(getTripEventAttachmentsDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  return { fullPath, filename };
}

export function unlinkTripEventAttachmentFile(
  filePath: string | null | undefined
): void {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}
