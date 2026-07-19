import { ensureInitialized } from "../lib/db/migrations";
import { isJobRunning } from "../lib/jobs/queries";
import { runSyncAnalyzeJob } from "../lib/jobs/runner";

async function main() {
  ensureInitialized();
  if (isJobRunning()) {
    throw new Error("Ein Sync-/Analyse-Lauf ist bereits aktiv.");
  }
  const result = await runSyncAnalyzeJob("manual");
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok || result.status === "error") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
