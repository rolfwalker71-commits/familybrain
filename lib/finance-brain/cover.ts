import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/client";
import {
  getFinanceLedgerById,
  setFinanceLedgerCover,
} from "@/lib/finance-brain/queries";
import { getTripsDataRoot } from "@/lib/trips/paths";

export function getFinanceLedgerCoversDir(): string {
  return path.join(getTripsDataRoot(), "finance-ledger-covers");
}

export function ensureFinanceLedgerCoversDir(): void {
  fs.mkdirSync(getFinanceLedgerCoversDir(), { recursive: true });
}

export function ledgerCoverPublicUrl(
  coverPath: string | null | undefined
): string | null {
  if (!coverPath) return null;
  return `/api/finance-ledgers/media/cover/${encodeURIComponent(
    path.basename(coverPath)
  )}`;
}

export function resolveFinanceLedgerCoverPath(
  filename: string
): string | null {
  const safe = path.basename(filename);
  if (!safe || safe.includes("..")) return null;
  const full = path.join(getFinanceLedgerCoversDir(), safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

function deleteCoverFile(filePath: string | null | undefined) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

export async function saveFinanceLedgerCoverUpload(
  ledgerId: number,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  ensureFinanceLedgerCoversDir();
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");
  const previous = ledger.cover_path;
  const ext = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : "jpg";
  const filename = `ledger-${ledgerId}-${randomUUID().slice(0, 8)}.${ext}`;
  const fullPath = path.join(getFinanceLedgerCoversDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  setFinanceLedgerCover(ledgerId, {
    coverPath: fullPath,
    coverPrompt: null,
  });
  deleteCoverFile(previous !== fullPath ? previous : null);
  return fullPath;
}

export async function generateFinanceLedgerCover(
  ledgerId: number,
  userPrompt?: string | null
): Promise<string> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt.");
  }
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");

  const prompt =
    userPrompt?.trim() ||
    `Friendly flat illustration header for a shared household expense ledger titled «${ledger.title}». Soft sage green and cream palette, warm lifestyle scene (friends, travel, or home accounting vibe), no text, no logos, no photorealism — clean editorial illustration suitable as a compact card title image.`;

  ensureFinanceLedgerCoversDir();
  const client = getOpenAIClient();
  const result = await client.images.generate({
    model: "gpt-image-2",
    prompt,
    size: "1024x1024",
    quality: "low",
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildgenerierung lieferte kein Bild.");

  const buffer = Buffer.from(b64, "base64");
  const filename = `ledger-${ledgerId}-${randomUUID().slice(0, 8)}.png`;
  const fullPath = path.join(getFinanceLedgerCoversDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  const previous = ledger.cover_path;
  setFinanceLedgerCover(ledgerId, {
    coverPath: fullPath,
    coverPrompt: prompt,
  });
  deleteCoverFile(previous !== fullPath ? previous : null);
  return fullPath;
}
