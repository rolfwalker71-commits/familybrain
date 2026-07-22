import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
import {
  EXPENSE_CATEGORY_LABELS,
  expenseVisualFromLabel,
  expenseVisualFromText,
  resolveCategoryLabel,
  type ExpenseVisual,
} from "@/lib/finance-brain/expense-category";
import {
  setFinanceExpenseCategory,
  type FinanceExpenseRow,
} from "@/lib/finance-brain/queries";

export type ClassifyExpenseInput = {
  description?: string | null;
  amount?: number | null;
  currency?: string | null;
  expenseDate?: string | null;
  place?: string | null;
};

/** AI category pick; falls back to keywords when OpenAI is missing/fails. */
export async function classifyExpenseCategory(
  input: ClassifyExpenseInput
): Promise<ExpenseVisual> {
  const fallback = expenseVisualFromText(input.description);

  if (!hasOpenAIKey()) return fallback;
  const description = (input.description || "").trim();
  if (!description) return fallback;

  try {
    const client = getOpenAIClient();
    const model = getOpenAIModel();
    const labels = EXPENSE_CATEGORY_LABELS.join(", ");
    const details = [
      `Description: ${description}`,
      input.amount != null ? `Amount: ${input.amount} ${input.currency || ""}` : null,
      input.expenseDate ? `Date: ${input.expenseDate}` : null,
      input.place ? `Place: ${input.place}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 40,
      messages: [
        {
          role: "system",
          content:
            "You classify shared trip/group expenses into exactly one category label. " +
            `Allowed labels: ${labels}. ` +
            "Reply with ONLY the label text, nothing else. " +
            "Examples: Frühstück → Essen; Uber to airport → Taxi / Transfer; Marriott night → Hotel.",
        },
        { role: "user", content: details },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const label = resolveCategoryLabel(raw.replace(/^["']|["']$/g, ""));
    return expenseVisualFromLabel(label);
  } catch (error) {
    console.error("[finance-brain] category classify failed:", error);
    return fallback;
  }
}

export async function classifyAndStoreExpenseCategory(
  expense: FinanceExpenseRow,
  place?: string | null
): Promise<FinanceExpenseRow> {
  const visual = await classifyExpenseCategory({
    description: expense.description,
    amount: expense.amount,
    currency: expense.currency,
    expenseDate: expense.expense_date,
    place,
  });
  return setFinanceExpenseCategory(expense.id, {
    categoryLabel: visual.label,
    categoryTone: visual.tone,
  });
}
