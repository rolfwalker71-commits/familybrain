/**
 * Approximate list prices (USD per 1M tokens). Update when pricing changes.
 * DeepSeek input uses cache-miss rate (conservative if cache hits occur).
 */
const MODEL_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o4-mini": { input: 1.1, output: 4.4 },
  // DeepSeek API — https://api-docs.deepseek.com/quick_start/pricing
  "deepseek-v4-flash": { input: 0.14, output: 0.28 },
  "deepseek-v4-pro": { input: 0.435, output: 0.87 },
  // Legacy aliases (retired 2026-07-24; map to Flash non-/thinking pricing)
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek-reasoner": { input: 0.14, output: 0.28 },
};

export type AiTokenUsage = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Best-effort USD estimate from list prices; null if model unknown. */
  estimatedCostUsd: number | null;
};

export function estimateOpenAiCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number | null {
  const parts = estimateOpenAiCostPartsUsd(
    model,
    promptTokens,
    completionTokens
  );
  if (!parts) return null;
  return parts.inputUsd + parts.outputUsd;
}

export function buildAiTokenUsage(
  model: string,
  usage: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  } | null
    | undefined
): AiTokenUsage {
  const promptTokens = Number(usage?.prompt_tokens || 0);
  const completionTokens = Number(usage?.completion_tokens || 0);
  const totalTokens =
    Number(usage?.total_tokens || 0) || promptTokens + completionTokens;
  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: estimateOpenAiCostUsd(
      model,
      promptTokens,
      completionTokens
    ),
  };
}

export function formatUsdCost(usd: number | null | undefined): string | null {
  if (usd == null || !Number.isFinite(usd)) return null;
  if (usd < 0.0001) return "< $0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function modelRates(model: string): { input: number; output: number } | null {
  const key = model.trim().toLowerCase();
  return (
    MODEL_USD_PER_MTOK[key] ||
    MODEL_USD_PER_MTOK[key.replace(/-\d{8}$/, "")] ||
    null
  );
}

/** Input-/Output-Kosten getrennt (Listenpreise, ungefähr). */
export function estimateOpenAiCostPartsUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): { inputUsd: number; outputUsd: number } | null {
  const rates = modelRates(model);
  if (!rates) return null;
  return {
    inputUsd: (promptTokens / 1_000_000) * rates.input,
    outputUsd: (completionTokens / 1_000_000) * rates.output,
  };
}

export function formatTokenUsageLine(u: AiTokenUsage | null | undefined): string | null {
  if (!u || u.totalTokens <= 0) return null;
  const cost = formatUsdCost(u.estimatedCostUsd);
  return [
    `${u.promptTokens.toLocaleString("de-CH")} in`,
    `${u.completionTokens.toLocaleString("de-CH")} out`,
    cost ? `≈ ${cost}` : null,
    u.model ? `(${u.model})` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Mehrzeilige Übersicht Input/Output inkl. ungefährer USD-Beträge.
 * Nur für UI — nicht in Ticket-Kommentare schreiben.
 */
export function formatTokenUsageBreakdownLines(
  u: AiTokenUsage | null | undefined
): string[] {
  if (!u || u.totalTokens <= 0) return [];
  const parts = estimateOpenAiCostPartsUsd(
    u.model,
    u.promptTokens,
    u.completionTokens
  );
  const inCost = parts ? formatUsdCost(parts.inputUsd) : null;
  const outCost = parts ? formatUsdCost(parts.outputUsd) : null;
  const total = formatUsdCost(u.estimatedCostUsd);
  return [
    `Input: ${u.promptTokens.toLocaleString("de-CH")} Token${
      inCost ? ` ≈ ${inCost}` : ""
    }`,
    `Output: ${u.completionTokens.toLocaleString("de-CH")} Token${
      outCost ? ` ≈ ${outCost}` : ""
    }`,
    total
      ? `Gesamt ≈ ${total}${u.model ? ` · ${u.model}` : ""} (Listenpreis, ungefähr)`
      : u.model
        ? `Modell: ${u.model}`
        : "",
  ].filter(Boolean);
}
