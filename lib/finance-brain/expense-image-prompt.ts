/** Built-in default for FinanzBrain expense AI thumbnails. */
export const DEFAULT_EXPENSE_AI_IMAGE_PROMPT = `Square finance illustration (not photorealistic) for a «{{category}}» expense.
Description: {{description}}.
Details: {{details}}.
Scene idea: {{scene}}.
Style: clean modern editorial illustration, soft flat colors with gentle shading, friendly travel-expense vibe. Any text in the image must be spelled correctly and clearly readable. No logos, watermarks, prices, receipts, or UI chrome. Suitable as a small card thumbnail.`;

export const EXPENSE_AI_IMAGE_PROMPT_PLACEHOLDERS = [
  "{{category}}",
  "{{description}}",
  "{{details}}",
  "{{amount}}",
  "{{currency}}",
  "{{date}}",
  "{{place}}",
  "{{scene}}",
] as const;

export type ExpenseImagePromptInput = {
  category?: string | null;
  description?: string | null;
  amount?: number | null;
  currency?: string | null;
  expenseDate?: string | null;
  place?: string | null;
  paidByName?: string | null;
};

function clip(raw: string | null | undefined, max: number): string {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value || "—");
  }
  return out.replace(/\s+/g, " ").trim();
}

export function buildExpenseImagePrompt(
  input: ExpenseImagePromptInput & { scene?: string },
  template: string = DEFAULT_EXPENSE_AI_IMAGE_PROMPT
): string {
  const category = clip(input.category, 40) || "Ausgabe";
  const description = clip(input.description, 120) || "Expense";
  const amount =
    input.amount != null && Number.isFinite(input.amount)
      ? String(input.amount)
      : "";
  const currency = clip(input.currency, 8);
  const date = clip(input.expenseDate, 20);
  const place = clip(input.place, 80);
  const paidBy = clip(input.paidByName, 40);

  const detailParts: string[] = [];
  if (amount && currency) detailParts.push(`amount ${amount} ${currency}`);
  else if (amount) detailParts.push(`amount ${amount}`);
  if (date) detailParts.push(`date ${date}`);
  if (place) detailParts.push(`place ${place}`);
  if (paidBy) detailParts.push(`paid by ${paidBy}`);

  return applyTemplate(template.trim() || DEFAULT_EXPENSE_AI_IMAGE_PROMPT, {
    category,
    description,
    details: detailParts.join("; "),
    amount,
    currency,
    date,
    place,
    scene: clip(input.scene, 160) || "friendly shared travel expense atmosphere",
  });
}
