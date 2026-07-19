import { syncPaperlessDocuments } from "../lib/paperless/sync";
import { ensureInitialized } from "../lib/db/migrations";
import { isJobRunning } from "../lib/jobs/queries";

async function main() {
  ensureInitialized();
  if (isJobRunning()) {
    throw new Error("Ein automatischer Sync-/Analyse-Lauf ist bereits aktiv.");
  }
  const result = await syncPaperlessDocuments();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
