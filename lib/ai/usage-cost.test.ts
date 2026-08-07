import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAiTokenUsage,
  estimateOpenAiCostUsd,
  formatTokenUsageLine,
  formatUsdCost,
} from "@/lib/ai/usage-cost";

test("estimateOpenAiCostUsd for gpt-4o-mini", () => {
  // 1M in + 1M out = 0.15 + 0.60
  assert.equal(estimateOpenAiCostUsd("gpt-4o-mini", 1_000_000, 1_000_000), 0.75);
  assert.equal(estimateOpenAiCostUsd("unknown-model", 100, 100), null);
});

test("buildAiTokenUsage + format", () => {
  const u = buildAiTokenUsage("gpt-4o-mini", {
    prompt_tokens: 2000,
    completion_tokens: 500,
    total_tokens: 2500,
  });
  assert.equal(u.promptTokens, 2000);
  assert.equal(u.completionTokens, 500);
  assert.ok(u.estimatedCostUsd != null && u.estimatedCostUsd > 0);
  assert.ok(formatUsdCost(u.estimatedCostUsd)?.startsWith("$"));
  assert.ok(formatTokenUsageLine(u)?.includes("in"));
});
