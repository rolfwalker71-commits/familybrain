import fs from "fs";
import path from "path";
import { getDatabasePath } from "@/lib/db/client";

export function getGuidesDirectory(): string {
  const dbPath = getDatabasePath();
  return path.join(path.dirname(dbPath), "guides");
}

export function ensureGuidesDirectory(): string {
  const dir = getGuidesDirectory();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function guideFilePath(guideId: number, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return path.join(ensureGuidesDirectory(), `${guideId}-${safeName}`);
}

export function deleteGuideFile(filePath: string | null | undefined): void {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore missing files */
  }
}
