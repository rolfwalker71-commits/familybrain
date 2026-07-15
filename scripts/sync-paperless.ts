import { syncPaperlessDocuments } from "../lib/paperless/sync";
import { ensureInitialized } from "../lib/db/migrations";

async function main() {
  ensureInitialized();
  const result = await syncPaperlessDocuments();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
