import type Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { KNOWLEDGE_AREAS } from "@/lib/extraction/categories";

/**
 * Apply schema + seed data to an open DB connection.
 * Must NOT import getDb() — kept free of circular deps with client.ts.
 */
export function bootstrapDatabase(db: Database.Database): void {
  const schemaPath = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "lib",
    "db",
    "schema.sql"
  );
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);

  const financeCols = db
    .prepare(`PRAGMA table_info(financial_items)`)
    .all() as Array<{ name: string }>;
  if (!financeCols.some((c) => c.name === "counts_in_stats")) {
    db.exec(
      `ALTER TABLE financial_items ADD COLUMN counts_in_stats INTEGER NOT NULL DEFAULT 1`
    );
  }

  const travelCols = db
    .prepare(`PRAGMA table_info(travel_items)`)
    .all() as Array<{ name: string }>;
  if (!travelCols.some((c) => c.name === "travel_type_override")) {
    db.exec(`ALTER TABLE travel_items ADD COLUMN travel_type_override TEXT`);
  }

  const summaryCols = db
    .prepare(`PRAGMA table_info(document_summaries)`)
    .all() as Array<{ name: string }>;
  const summaryColNames = new Set(summaryCols.map((c) => c.name));
  if (!summaryColNames.has("analysis_attempts")) {
    db.exec(
      `ALTER TABLE document_summaries ADD COLUMN analysis_attempts INTEGER NOT NULL DEFAULT 0`
    );
  }
  if (!summaryColNames.has("analysis_claimed_at")) {
    db.exec(`ALTER TABLE document_summaries ADD COLUMN analysis_claimed_at TEXT`);
  }
  if (!summaryColNames.has("analysis_claim_hash")) {
    db.exec(`ALTER TABLE document_summaries ADD COLUMN analysis_claim_hash TEXT`);
  }
  if (!summaryColNames.has("analysis_next_retry_at")) {
    db.exec(
      `ALTER TABLE document_summaries ADD COLUMN analysis_next_retry_at TEXT`
    );
  }
  if (!summaryColNames.has("analysis_last_error")) {
    db.exec(`ALTER TABLE document_summaries ADD COLUMN analysis_last_error TEXT`);
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_summaries_retry
     ON document_summaries(analysis_status, analysis_next_retry_at)`
  );

  const insertArea = db.prepare(
    `INSERT OR IGNORE INTO knowledge_areas (name, description) VALUES (?, ?)`
  );
  const seed = db.transaction(() => {
    for (const area of KNOWLEDGE_AREAS) {
      insertArea.run(area.name, area.description);
    }
  });
  seed();
  ensureTriliumNotesTable(db);
  ensureKnowledgeGuidesTables(db);
}

function ensureKnowledgeGuidesTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_guides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      page_count INTEGER,
      extracted_text TEXT,
      content_hash TEXT,
      embedding_status TEXT DEFAULT 'pending',
      embedding_error TEXT,
      last_indexed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS knowledge_guide_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guide_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      page_start INTEGER,
      page_end INTEGER,
      chunk_text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      qdrant_point_id TEXT NOT NULL,
      UNIQUE(guide_id, chunk_index),
      FOREIGN KEY(guide_id) REFERENCES knowledge_guides(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_guides_status ON knowledge_guides(embedding_status);
    CREATE INDEX IF NOT EXISTS idx_knowledge_guide_chunks_guide ON knowledge_guide_chunks(guide_id);
  `);
}

function ensureTriliumNotesTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trilium_notes (
      note_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      title TEXT,
      note_type TEXT,
      content_text TEXT,
      content_hash TEXT,
      date_modified TEXT,
      trilium_url TEXT,
      is_protected INTEGER NOT NULL DEFAULT 0,
      sync_status TEXT DEFAULT 'synced',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trilium_notes_scope ON trilium_notes(scope);
    CREATE INDEX IF NOT EXISTS idx_trilium_notes_modified ON trilium_notes(date_modified);
    CREATE INDEX IF NOT EXISTS idx_trilium_notes_status ON trilium_notes(sync_status);
  `);
}
