import { ensureInitialized } from "../lib/db/migrations";
import { getDatabasePath } from "../lib/db/client";

ensureInitialized();
console.log(`Database initialized at ${getDatabasePath()}`);
