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
  ensureChatCorrectionsTable(db);
  ensureTripsTables(db);
}

function ensureTripsTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      start_date TEXT,
      end_date TEXT,
      destination TEXT,
      summary TEXT,
      cover_path TEXT,
      cover_prompt TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trip_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      start_time TEXT,
      end_time TEXT,
      location TEXT,
      provider TEXT,
      booking_reference TEXT,
      notes TEXT,
      sort_key INTEGER NOT NULL DEFAULT 0,
      document_id INTEGER,
      travel_item_id INTEGER,
      guide_id INTEGER,
      note_id TEXT,
      source_excerpt TEXT,
      flight_number TEXT,
      airline TEXT,
      aircraft_reg TEXT,
      aircraft_type TEXT,
      departure_airport TEXT,
      arrival_airport TEXT,
      duration_minutes INTEGER,
      aircraft_image_path TEXT,
      departure_terminal TEXT,
      arrival_terminal TEXT,
      departure_gate TEXT,
      arrival_gate TEXT,
      check_in_desk TEXT,
      baggage_belt TEXT,
      departure_lat REAL,
      departure_lon REAL,
      arrival_lat REAL,
      arrival_lon REAL,
      origin_place TEXT,
      destination_place TEXT,
      place_name TEXT,
      address TEXT,
      phone TEXT,
      website TEXT,
      lat REAL,
      lon REAL,
      map_image_path TEXT,
      osm_id TEXT,
      enrichment_json TEXT,
      enriched_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_trips_start_date ON trips(start_date);
    CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
    CREATE INDEX IF NOT EXISTS idx_trip_events_trip ON trip_events(trip_id);
    CREATE INDEX IF NOT EXISTS idx_trip_events_start ON trip_events(start_date);
    CREATE TABLE IF NOT EXISTS trip_event_documents (
      trip_event_id INTEGER NOT NULL,
      document_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (trip_event_id, document_id),
      FOREIGN KEY(trip_event_id) REFERENCES trip_events(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES paperless_documents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_trip_event_documents_event
      ON trip_event_documents(trip_event_id);
    CREATE INDEX IF NOT EXISTS idx_trip_event_documents_doc
      ON trip_event_documents(document_id);
    CREATE TABLE IF NOT EXISTS trip_share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      label TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      revoked_at TEXT,
      FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_trip_share_links_trip
      ON trip_share_links(trip_id);
    CREATE INDEX IF NOT EXISTS idx_trip_share_links_token
      ON trip_share_links(token);
  `);

  // Backfill primary document_id into junction (once).
  db.exec(`
    INSERT OR IGNORE INTO trip_event_documents (trip_event_id, document_id, created_at)
    SELECT id, document_id, COALESCE(created_at, datetime('now'))
    FROM trip_events
    WHERE document_id IS NOT NULL AND document_id > 0
  `);

  const tripEventCols = db
    .prepare(`PRAGMA table_info(trip_events)`)
    .all() as Array<{ name: string }>;
  const tripEventColNames = new Set(tripEventCols.map((c) => c.name));
  const flightExtraCols: Array<[string, string]> = [
    ["departure_terminal", "TEXT"],
    ["arrival_terminal", "TEXT"],
    ["departure_gate", "TEXT"],
    ["arrival_gate", "TEXT"],
    ["check_in_desk", "TEXT"],
    ["baggage_belt", "TEXT"],
    ["departure_lat", "REAL"],
    ["departure_lon", "REAL"],
    ["arrival_lat", "REAL"],
    ["arrival_lon", "REAL"],
    ["origin_place", "TEXT"],
    ["destination_place", "TEXT"],
    ["document_notes_md", "TEXT"],
    ["show_document_notes", "INTEGER NOT NULL DEFAULT 1"],
    ["document_notes_enriched_at", "TEXT"],
  ];
  for (const [name, type] of flightExtraCols) {
    if (!tripEventColNames.has(name)) {
      db.exec(`ALTER TABLE trip_events ADD COLUMN ${name} ${type}`);
    }
  }
}

function ensureChatCorrectionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT,
      content TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_corrections_active ON chat_corrections(active);
  `);
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
      embedding_status TEXT DEFAULT 'pending',
      embedding_error TEXT,
      last_indexed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trilium_notes_scope ON trilium_notes(scope);
    CREATE INDEX IF NOT EXISTS idx_trilium_notes_modified ON trilium_notes(date_modified);
    CREATE INDEX IF NOT EXISTS idx_trilium_notes_status ON trilium_notes(sync_status);
  `);

  const cols = db
    .prepare(`PRAGMA table_info(trilium_notes)`)
    .all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("embedding_status")) {
    db.exec(
      `ALTER TABLE trilium_notes ADD COLUMN embedding_status TEXT DEFAULT 'pending'`
    );
  }
  if (!names.has("embedding_error")) {
    db.exec(`ALTER TABLE trilium_notes ADD COLUMN embedding_error TEXT`);
  }
  if (!names.has("last_indexed_at")) {
    db.exec(`ALTER TABLE trilium_notes ADD COLUMN last_indexed_at TEXT`);
  }
  // After columns exist (fresh create or ALTER) — safe for older DBs.
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_trilium_notes_embedding ON trilium_notes(embedding_status)`
  );
}
