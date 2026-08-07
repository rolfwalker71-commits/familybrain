/** Approximate OpenAI list prices (USD per 1M tokens). Update when pricing changes. */
const MODEL_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o4-mini": { input: 1.1, output: 4.4 },
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
  const key = model.trim().toLowerCase();
  const rates =
    MODEL_USD_PER_MTOK[key] ||
    MODEL_USD_PER_MTOK[key.replace(/-\d{8}$/, "")] ||
    null;
  if (!rates) return null;
  return (
    (promptTokens / 1_000_000) * rates.input +
    (completionTokens / 1_000_000) * rates.output
  );
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
