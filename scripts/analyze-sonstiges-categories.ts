/**
 * CLI: cluster Sonstiges documents and print category suggestions.
 * Usage: npx tsx scripts/analyze-sonstiges-categories.ts
 */
import { ensureInitialized } from "../lib/db/migrations";
import { ensureBuiltinKnowledgeAreas } from "../lib/knowledge/areas";
import {
  analyzeSonstigesForCategorySuggestions,
  listCategorySuggestions,
} from "../lib/documents/category-suggestions";
import { maybeRemapKnowledgeCategoriesOnce } from "../lib/documents/category-remap";

ensureInitialized();
ensureBuiltinKnowledgeAreas();
const remap = maybeRemapKnowledgeCategoriesOnce();
console.log("remap", remap);

const result = analyzeSonstigesForCategorySuggestions();
console.log("analyze", result);
for (const s of listCategorySuggestions({ status: "pending" })) {
  console.log(
    `- ${s.mapToExisting ? `→ ${s.mapToExisting}` : `NEW ${s.proposedName}`} (${s.documentIds.length}): ${s.sampleTitles.slice(0, 3).join(" | ")}`
  );
}
