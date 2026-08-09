import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAiTokenUsage,
  estimateOpenAiCostUsd,
  formatTokenUsageBreakdownLines,
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

test("formatTokenUsageBreakdownLines splits input/output cost", () => {
  const u = buildAiTokenUsage("gpt-4o-mini", {
    prompt_tokens: 2000,
    completion_tokens: 500,
    total_tokens: 2500,
  });
  const lines = formatTokenUsageBreakdownLines(u);
  assert.equal(lines.length, 3);
  assert.match(lines[0]!, /^Input: .*2000|2['’\. ]?000.*Token/);
  assert.match(lines[1]!, /^Output: .*500.*Token/);
  assert.match(lines[2]!, /Gesamt/);
  assert.ok(lines[0]!.includes("≈"));
  assert.ok(lines[1]!.includes("≈"));
});
