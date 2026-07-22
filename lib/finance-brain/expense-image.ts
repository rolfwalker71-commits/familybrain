import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/client";
import { buildExpenseImagePrompt } from "@/lib/finance-brain/expense-image-prompt";
import { getExpenseAiImagePromptTemplate } from "@/lib/finance-brain/expense-image-settings";
import { sceneForExpenseCategory } from "@/lib/finance-brain/expense-category";
import {
  getFinanceExpenseById,
  getFinanceLedgerMemberById,
  setFinanceExpenseAiImage,
  type FinanceExpenseRow,
} from "@/lib/finance-brain/queries";
import { getTripsDataRoot } from "@/lib/trips/paths";

export function getFinanceExpenseAiDir(): string {
  return path.join(getTripsDataRoot(), "finance-expense-ai");
}

export function ensureFinanceExpenseAiDir(): void {
  fs.mkdirSync(getFinanceExpenseAiDir(), { recursive: true });
}

export function expenseAiImagePublicUrl(
  aiImagePath: string | null | undefined
): string | null {
  if (!aiImagePath) return null;
  return `/api/finance-ledgers/media/ai/${encodeURIComponent(
    path.basename(aiImagePath)
  )}`;
}

export function expenseAiImageSharePublicUrl(
  token: string,
  aiImagePath: string | null | undefined
): string | null {
  if (!aiImagePath) return null;
  return `/api/share/f/${encodeURIComponent(token)}/media/ai/${encodeURIComponent(
    path.basename(aiImagePath)
  )}`;
}

export function resolveFinanceExpenseAiPath(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe || safe.includes("..")) return null;
  const full = path.join(getFinanceExpenseAiDir(), safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

function deleteAiImageFile(filePath: string | null | undefined) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

export async function generateExpenseAiImage(
  expenseId: number,
  options?: { userPrompt?: string | null; place?: string | null }
): Promise<FinanceExpenseRow> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt.");
  }
  const expense = getFinanceExpenseById(expenseId);
  if (!expense) throw new Error("Ausgabe nicht gefunden");

  const payer = getFinanceLedgerMemberById(expense.paid_by_member_id);
  const category = expense.category_label || "Ausgabe";
  const prompt =
    options?.userPrompt?.trim() ||
    buildExpenseImagePrompt(
      {
        category,
        description: expense.description,
        amount: expense.amount,
        currency: expense.currency,
        expenseDate: expense.expense_date,
        place: options?.place,
        paidByName: payer?.display_name,
        scene: sceneForExpenseCategory(category),
      },
      getExpenseAiImagePromptTemplate()
    );

  ensureFinanceExpenseAiDir();
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
  const filename = `expense-${expenseId}-${randomUUID().slice(0, 8)}.png`;
  const fullPath = path.join(getFinanceExpenseAiDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  deleteAiImageFile(expense.ai_image_path);

  return setFinanceExpenseAiImage(expenseId, {
    aiImagePath: fullPath,
    aiImagePrompt: prompt,
  });
}

export function clearExpenseAiImage(expenseId: number): FinanceExpenseRow {
  const expense = getFinanceExpenseById(expenseId);
  if (!expense) throw new Error("Ausgabe nicht gefunden");
  deleteAiImageFile(expense.ai_image_path);
  return setFinanceExpenseAiImage(expenseId, {
    aiImagePath: null,
    aiImagePrompt: null,
  });
}
