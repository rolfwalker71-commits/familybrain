import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getTripsDataRoot } from "@/lib/trips/paths";
import {
  getFinanceExpenseById,
  setFinanceExpenseReceiptPath,
} from "@/lib/finance-brain/queries";

export function getFinanceReceiptsDir(): string {
  return path.join(getTripsDataRoot(), "finance-receipts");
}

export function ensureFinanceReceiptsDir(): void {
  fs.mkdirSync(getFinanceReceiptsDir(), { recursive: true });
}

export function receiptPublicUrl(
  receiptPath: string | null | undefined
): string | null {
  if (!receiptPath) return null;
  return `/api/finance-ledgers/media/receipt/${encodeURIComponent(
    path.basename(receiptPath)
  )}`;
}

export function receiptSharePublicUrl(
  token: string,
  receiptPath: string | null | undefined
): string | null {
  if (!receiptPath) return null;
  return `/api/share/f/${encodeURIComponent(token)}/media/receipt/${encodeURIComponent(
    path.basename(receiptPath)
  )}`;
}

export function resolveFinanceReceiptPath(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe || safe.includes("..")) return null;
  const full = path.join(getFinanceReceiptsDir(), safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

function extForMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("heic") || mimeType.includes("heif")) return "heic";
  return "jpg";
}

export function contentTypeForReceipt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  return "image/jpeg";
}

export async function saveExpenseReceiptUpload(
  expenseId: number,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const expense = getFinanceExpenseById(expenseId);
  if (!expense) throw new Error("Ausgabe nicht gefunden");
  ensureFinanceReceiptsDir();
  const previous = expense.receipt_path || null;
  const ext = extForMime(mimeType);
  const filename = `expense-${expenseId}-${randomUUID().slice(0, 8)}.${ext}`;
  const fullPath = path.join(getFinanceReceiptsDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  setFinanceExpenseReceiptPath(expenseId, fullPath);
  if (previous && previous !== fullPath && fs.existsSync(previous)) {
    try {
      fs.unlinkSync(previous);
    } catch {
      /* ignore */
    }
  }
  return fullPath;
}

export function clearExpenseReceipt(expenseId: number): void {
  const expense = getFinanceExpenseById(expenseId);
  if (!expense) throw new Error("Ausgabe nicht gefunden");
  const previous = expense.receipt_path;
  setFinanceExpenseReceiptPath(expenseId, null);
  if (previous && fs.existsSync(previous)) {
    try {
      fs.unlinkSync(previous);
    } catch {
      /* ignore */
    }
  }
}

export function unlinkReceiptFile(receiptPath: string | null | undefined): void {
  if (!receiptPath || !fs.existsSync(receiptPath)) return;
  try {
    fs.unlinkSync(receiptPath);
  } catch {
    /* ignore */
  }
}
