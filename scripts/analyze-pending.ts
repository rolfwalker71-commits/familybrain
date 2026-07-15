import { ensureInitialized } from "../lib/db/migrations";
import { analyzePendingBatch } from "../lib/ai/analyze-document";

async function main() {
  ensureInitialized();
  const limit = Number(process.argv[2] || 10);
  const result = await analyzePendingBatch(limit);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
