import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const globalForDb = globalThis as unknown as {
  familybrainDb?: Database.Database;
};

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
  }
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "data",
    "familybrain.sqlite"
  );
}

export function getDb(): Database.Database {
  if (globalForDb.familybrainDb) {
    return globalForDb.familybrainDb;
  }

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  globalForDb.familybrainDb = db;
  return db;
}

export function getDatabasePath(): string {
  return resolveDbPath();
}
