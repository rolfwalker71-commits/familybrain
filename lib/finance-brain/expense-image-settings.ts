import { getSetting, setSetting } from "@/lib/db/migrations";
import { DEFAULT_EXPENSE_AI_IMAGE_PROMPT } from "@/lib/finance-brain/expense-image-prompt";

export const EXPENSE_AI_IMAGE_PROMPT_SETTING = "finance_expense_ai_image_prompt";
const MAX_PROMPT_LENGTH = 4000;

export function getExpenseAiImagePromptTemplate(): string {
  const stored = getSetting(EXPENSE_AI_IMAGE_PROMPT_SETTING);
  if (stored == null || !stored.trim()) {
    return DEFAULT_EXPENSE_AI_IMAGE_PROMPT;
  }
  return stored.trim();
}

export function isExpenseAiImagePromptCustomized(): boolean {
  const stored = getSetting(EXPENSE_AI_IMAGE_PROMPT_SETTING);
  return stored != null && stored.trim().length > 0;
}

export function saveExpenseAiImagePromptTemplate(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    throw new Error(
      `KI-Bild-Prompt darf höchstens ${MAX_PROMPT_LENGTH} Zeichen haben.`
    );
  }
  if (!trimmed) {
    setSetting(EXPENSE_AI_IMAGE_PROMPT_SETTING, null);
    return DEFAULT_EXPENSE_AI_IMAGE_PROMPT;
  }
  setSetting(EXPENSE_AI_IMAGE_PROMPT_SETTING, trimmed);
  return trimmed;
}

export function resetExpenseAiImagePromptTemplate(): string {
  setSetting(EXPENSE_AI_IMAGE_PROMPT_SETTING, null);
  return DEFAULT_EXPENSE_AI_IMAGE_PROMPT;
}
