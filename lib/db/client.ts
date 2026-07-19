import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { bootstrapDatabase } from "./bootstrap";

const globalForDb = globalThis as unknown as {
  familybrainDb?: Database.Database;
  familybrainInitialized?: boolean;
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
  if (globalForDb.familybrainDb && globalForDb.familybrainInitialized) {
    return globalForDb.familybrainDb;
  }

  if (globalForDb.familybrainDb && !globalForDb.familybrainInitialized) {
    // Previous open without successful bootstrap – close and retry.
    try {
      globalForDb.familybrainDb.close();
    } catch {
      /* ignore */
    }
    globalForDb.familybrainDb = undefined;
  }

  const dbPath = resolveDbPath();
  const dbDir = path.dirname(dbPath);
  try {
    fs.mkdirSync(dbDir, { recursive: true });
  } catch (error) {
    throw new Error(
      `Cannot create database directory '${dbDir}': ${
        error instanceof Error ? error.message : String(error)
      }. Fix host volume permissions (e.g. chown -R 1000:1000 ./data).`,
      { cause: error }
    );
  }

  let db: Database.Database;
  try {
    db = new Database(dbPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot open SQLite database '${dbPath}': ${detail}. ` +
        `The directory must be writable by the app user (Docker: uid 1000). ` +
        `On the host: sudo chown -R 1000:1000 ./data && docker compose restart`,
      { cause: error }
    );
  }
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  globalForDb.familybrainDb = db;

  try {
    bootstrapDatabase(db);
    globalForDb.familybrainInitialized = true;
  } catch (error) {
    globalForDb.familybrainInitialized = false;
    try {
      db.close();
    } catch {
      /* ignore */
    }
    globalForDb.familybrainDb = undefined;
    throw error;
  }

  return db;
}

export function getDatabasePath(): string {
  return resolveDbPath();
}
