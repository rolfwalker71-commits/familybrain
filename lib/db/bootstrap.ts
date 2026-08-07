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
  try {
    db.exec(schema);
  } catch (error) {
    // Existing DBs may lack columns referenced by newer CREATE INDEX IF NOT EXISTS
    // statements. Continue with ensure* migrations which add columns safely.
    console.error(
      "[familybrain] schema.sql apply had errors (continuing with migrations):",
      error instanceof Error ? error.message : error
    );
  }

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
  if (!summaryColNames.has("embedding_status")) {
    db.exec(
      `ALTER TABLE document_summaries ADD COLUMN embedding_status TEXT DEFAULT 'pending'`
    );
  }
  if (!summaryColNames.has("embedding_error")) {
    db.exec(`ALTER TABLE document_summaries ADD COLUMN embedding_error TEXT`);
  }
  if (!summaryColNames.has("last_indexed_at")) {
    db.exec(`ALTER TABLE document_summaries ADD COLUMN last_indexed_at TEXT`);
  }
  if (!summaryColNames.has("line_items")) {
    db.exec(`ALTER TABLE document_summaries ADD COLUMN line_items TEXT`);
  }
  if (!summaryColNames.has("tax_year")) {
    db.exec(`ALTER TABLE document_summaries ADD COLUMN tax_year INTEGER`);
  }
  if (!summaryColNames.has("also_categories")) {
    db.exec(`ALTER TABLE document_summaries ADD COLUMN also_categories TEXT`);
  }
  if (!summaryColNames.has("bank_name")) {
    db.exec(`ALTER TABLE document_summaries ADD COLUMN bank_name TEXT`);
  }
  if (!summaryColNames.has("account_number")) {
    db.exec(`ALTER TABLE document_summaries ADD COLUMN account_number TEXT`);
  }
  if (!summaryColNames.has("is_bank_document")) {
    db.exec(
      `ALTER TABLE document_summaries ADD COLUMN is_bank_document INTEGER`
    );
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_summaries_tax_year
     ON document_summaries(category, tax_year)`
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_summaries_retry
     ON document_summaries(analysis_status, analysis_next_retry_at)`
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_summaries_embedding
     ON document_summaries(embedding_status)`
  );

  ensureExtractOverrideColumns(db);
  ensurePaymentCustomFieldColumns(db);
  ensureDocumentAiIconColumns(db);
  ensureDocumentTriageColumns(db);
  ensureDocumentRecipientColumns(db);
  ensurePaperlessFieldSyncLogTable(db);

  const insertArea = db.prepare(
    `INSERT OR IGNORE INTO knowledge_areas (name, description) VALUES (?, ?)`
  );
  const updateAreaDesc = db.prepare(
    `UPDATE knowledge_areas SET description = ?
     WHERE name = ? AND (description IS NULL OR description = '')`
  );
  const seed = db.transaction(() => {
    for (const area of KNOWLEDGE_AREAS) {
      insertArea.run(area.name, area.description);
      updateAreaDesc.run(area.description, area.name);
    }
  });
  seed();
  ensureTriliumNotesTable(db);
  ensureKnowledgeGuidesTables(db);
  ensureChatCorrectionsTable(db);
  ensureTripsTables(db);
  ensureUsersTable(db);
  ensureFamilyMembersTable(db);
  ensureTripTravelersTable(db);
  ensureFinanceBrainTables(db);
  ensureUserAccessTables(db);
  ensureInboxTaskTables(db);
  ensureMailAnalysesTable(db);
  ensureMailSenderPrefsTable(db);
  ensureMailAppliedLinksTable(db);
  ensureReferenceNotesTable(db);
  ensureActivityLogTable(db);
  ensurePushSubscriptionsTable(db);
  ensureCreditCardStatDecisionsTable(db);
}

function ensureCreditCardStatDecisionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_card_stat_decisions (
      scope TEXT NOT NULL CHECK(scope IN ('merchant', 'charge')),
      decision_key TEXT NOT NULL,
      excluded INTEGER NOT NULL CHECK(excluded IN (0, 1)),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope, decision_key)
    )
  `);
}

function ensurePushSubscriptionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_key TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      endpoint_hash TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner
      ON push_subscriptions(owner_key);
  `);
}

function ensureActivityLogTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      actor TEXT,
      source TEXT,
      metadata_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_activity_log_entity
      ON activity_log(entity_type, entity_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_log_created
      ON activity_log(created_at DESC);
  `);
}

function ensureReferenceNotesTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reference_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      reference TEXT,
      source_message_id TEXT,
      trilium_note_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reference_notes_user
      ON reference_notes(user_id, created_at DESC);
  `);
}

function ensureMailAnalysesTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_analyses (
      user_id INTEGER NOT NULL,
      message_id TEXT NOT NULL,
      thread_id TEXT,
      subject TEXT,
      from_name TEXT,
      from_email TEXT,
      snippet TEXT,
      status TEXT NOT NULL,
      relevance TEXT,
      summary TEXT,
      analysis_json TEXT,
      suggestion_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      analyzed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mail_analyses_status
      ON mail_analyses(user_id, status, analyzed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mail_analyses_thread
      ON mail_analyses(user_id, thread_id);
  `);
}

function ensureMailSenderPrefsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_sender_prefs (
      user_id INTEGER NOT NULL,
      from_domain TEXT NOT NULL,
      applied_count INTEGER NOT NULL DEFAULT 0,
      dismissed_count INTEGER NOT NULL DEFAULT 0,
      last_applied_at TEXT,
      last_dismissed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, from_domain)
    );
  `);
}

function ensureMailAppliedLinksTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_applied_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message_id TEXT NOT NULL,
      thread_id TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      google_event_id TEXT,
      calendar_id TEXT,
      task_id TEXT,
      reference TEXT,
      start_date TEXT,
      start_time TEXT,
      end_date TEXT,
      end_time TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mail_applied_links_thread
      ON mail_applied_links(user_id, thread_id);
    CREATE INDEX IF NOT EXISTS idx_mail_applied_links_ref
      ON mail_applied_links(user_id, reference);
  `);
}

function ensureInboxTaskTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inbox_task_state (
      owner_key TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      snoozed_until TEXT,
      note TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (owner_key, source_kind, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_inbox_task_state_status
      ON inbox_task_state(owner_key, status, completed_at);

    CREATE TABLE IF NOT EXISTS inbox_task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_key TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inbox_task_events_created
      ON inbox_task_events(owner_key, created_at DESC);
  `);
}

function ensureExtractOverrideColumns(db: Database.Database): void {
  const deadlineCols = db
    .prepare(`PRAGMA table_info(deadlines)`)
    .all() as Array<{ name: string }>;
  const deadlineNames = new Set(deadlineCols.map((c) => c.name));
  if (!deadlineNames.has("snoozed_until")) {
    db.exec(`ALTER TABLE deadlines ADD COLUMN snoozed_until TEXT`);
  }
  if (!deadlineNames.has("manual_override")) {
    db.exec(
      `ALTER TABLE deadlines ADD COLUMN manual_override INTEGER NOT NULL DEFAULT 0`
    );
  }

  const warrantyCols = db
    .prepare(`PRAGMA table_info(devices_and_warranties)`)
    .all() as Array<{ name: string }>;
  const warrantyNames = new Set(warrantyCols.map((c) => c.name));
  if (!warrantyNames.has("manual_override")) {
    db.exec(
      `ALTER TABLE devices_and_warranties ADD COLUMN manual_override INTEGER NOT NULL DEFAULT 0`
    );
  }

  const financeCols = db
    .prepare(`PRAGMA table_info(financial_items)`)
    .all() as Array<{ name: string }>;
  const financeNames = new Set(financeCols.map((c) => c.name));
  if (!financeNames.has("manual_override")) {
    db.exec(
      `ALTER TABLE financial_items ADD COLUMN manual_override INTEGER NOT NULL DEFAULT 0`
    );
  }
}

function ensurePaymentCustomFieldColumns(db: Database.Database): void {
  const cols = db
    .prepare(`PRAGMA table_info(paperless_documents)`)
    .all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("zu_bezahlen")) {
    db.exec(`ALTER TABLE paperless_documents ADD COLUMN zu_bezahlen INTEGER`);
  }
  if (!names.has("bezahlt")) {
    db.exec(`ALTER TABLE paperless_documents ADD COLUMN bezahlt INTEGER`);
  }
  if (!names.has("payment_planned_date")) {
    db.exec(
      `ALTER TABLE paperless_documents ADD COLUMN payment_planned_date TEXT`
    );
  }
  if (!names.has("payment_method")) {
    db.exec(`ALTER TABLE paperless_documents ADD COLUMN payment_method TEXT`);
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_docs_payment_flags
     ON paperless_documents(zu_bezahlen, bezahlt)`
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_docs_payment_planned
     ON paperless_documents(payment_planned_date)`
  );
}

function ensureDocumentAiIconColumns(db: Database.Database): void {
  const cols = db
    .prepare(`PRAGMA table_info(paperless_documents)`)
    .all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("ai_icon_path")) {
    db.exec(`ALTER TABLE paperless_documents ADD COLUMN ai_icon_path TEXT`);
  }
  if (!names.has("ai_icon_prompt")) {
    db.exec(`ALTER TABLE paperless_documents ADD COLUMN ai_icon_prompt TEXT`);
  }
}

function ensureDocumentTriageColumns(db: Database.Database): void {
  const cols = db
    .prepare(`PRAGMA table_info(paperless_documents)`)
    .all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("triage_status")) {
    db.exec(`ALTER TABLE paperless_documents ADD COLUMN triage_status TEXT`);
  }
  if (!names.has("triage_reasons")) {
    db.exec(`ALTER TABLE paperless_documents ADD COLUMN triage_reasons TEXT`);
  }
  if (!names.has("triage_at")) {
    db.exec(`ALTER TABLE paperless_documents ADD COLUMN triage_at TEXT`);
  }
  if (!names.has("triage_snoozed_until")) {
    db.exec(
      `ALTER TABLE paperless_documents ADD COLUMN triage_snoozed_until TEXT`
    );
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_docs_triage_status
     ON paperless_documents(triage_status)`
  );
}

function ensureDocumentRecipientColumns(db: Database.Database): void {
  const cols = db
    .prepare(`PRAGMA table_info(paperless_documents)`)
    .all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("recipient_member_ids")) {
    db.exec(
      `ALTER TABLE paperless_documents ADD COLUMN recipient_member_ids TEXT`
    );
  }
  if (!names.has("recipient_status")) {
    db.exec(
      `ALTER TABLE paperless_documents ADD COLUMN recipient_status TEXT`
    );
  }
  if (!names.has("recipient_at")) {
    db.exec(`ALTER TABLE paperless_documents ADD COLUMN recipient_at TEXT`);
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_docs_recipient_status
     ON paperless_documents(recipient_status)`
  );
}

function ensurePaperlessFieldSyncLogTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS paperless_field_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      field_name TEXT,
      field_value TEXT,
      document_local_id INTEGER,
      paperless_id INTEGER,
      document_title TEXT,
      message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_paperless_field_sync_log_created
      ON paperless_field_sync_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_paperless_field_sync_log_doc
      ON paperless_field_sync_log(document_local_id);
  `);
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
    CREATE TABLE IF NOT EXISTS trip_event_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_event_id INTEGER NOT NULL,
      title TEXT,
      original_filename TEXT,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      byte_size INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(trip_event_id) REFERENCES trip_events(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_trip_event_attachments_event
      ON trip_event_attachments(trip_event_id);
    CREATE TABLE IF NOT EXISTS trip_event_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_event_id INTEGER NOT NULL,
      user_id INTEGER,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      image_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(trip_event_id) REFERENCES trip_events(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_trip_event_comments_event
      ON trip_event_comments(trip_event_id);
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
    ["ai_image_path", "TEXT"],
    ["ai_image_prompt", "TEXT"],
    ["cabin_class", "TEXT"],
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

function ensureFinanceBrainTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS finance_ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      base_currency TEXT NOT NULL DEFAULT 'CHF',
      ledger_kind TEXT NOT NULL DEFAULT 'split',
      trip_id INTEGER,
      cover_path TEXT,
      cover_prompt TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_finance_ledgers_trip ON finance_ledgers(trip_id);

    CREATE TABLE IF NOT EXISTS finance_ledger_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_id INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT,
      user_id INTEGER,
      couple_id INTEGER,
      invite_token TEXT NOT NULL UNIQUE,
      invite_revoked_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(ledger_id) REFERENCES finance_ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_finance_ledger_members_ledger
      ON finance_ledger_members(ledger_id);
    CREATE INDEX IF NOT EXISTS idx_finance_ledger_members_token
      ON finance_ledger_members(invite_token);

    CREATE TABLE IF NOT EXISTS finance_ledger_couple_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(ledger_id) REFERENCES finance_ledgers(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_finance_ledger_couples_ledger
      ON finance_ledger_couple_groups(ledger_id);

    CREATE TABLE IF NOT EXISTS finance_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_id INTEGER NOT NULL,
      paid_by_member_id INTEGER NOT NULL,
      created_by_member_id INTEGER,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      exchange_rate REAL NOT NULL DEFAULT 1,
      amount_base REAL NOT NULL,
      description TEXT,
      expense_date TEXT,
      document_id INTEGER,
      trip_event_id INTEGER,
      receipt_path TEXT,
      category_label TEXT,
      category_tone TEXT,
      ai_image_path TEXT,
      ai_image_prompt TEXT,
      place_name TEXT,
      place_lat REAL,
      place_lon REAL,
      notified_at TEXT,
      note TEXT,
      direction TEXT NOT NULL DEFAULT 'expense',
      split_mode TEXT NOT NULL DEFAULT 'equal',
      pre_settled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(ledger_id) REFERENCES finance_ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY(paid_by_member_id) REFERENCES finance_ledger_members(id),
      FOREIGN KEY(created_by_member_id) REFERENCES finance_ledger_members(id),
      FOREIGN KEY(document_id) REFERENCES paperless_documents(id) ON DELETE SET NULL,
      FOREIGN KEY(trip_event_id) REFERENCES trip_events(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_finance_expenses_ledger ON finance_expenses(ledger_id);

    CREATE TABLE IF NOT EXISTS finance_expense_splits (
      expense_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      share_amount_base REAL NOT NULL,
      share_units REAL,
      PRIMARY KEY (expense_id, member_id),
      FOREIGN KEY(expense_id) REFERENCES finance_expenses(id) ON DELETE CASCADE,
      FOREIGN KEY(member_id) REFERENCES finance_ledger_members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS finance_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_id INTEGER NOT NULL,
      from_member_id INTEGER NOT NULL,
      to_member_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      exchange_rate REAL NOT NULL DEFAULT 1,
      amount_base REAL NOT NULL,
      note TEXT,
      settled_at TEXT NOT NULL,
      created_by_member_id INTEGER,
      notified_at TEXT,
      related_expense_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(ledger_id) REFERENCES finance_ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY(from_member_id) REFERENCES finance_ledger_members(id),
      FOREIGN KEY(to_member_id) REFERENCES finance_ledger_members(id),
      FOREIGN KEY(created_by_member_id) REFERENCES finance_ledger_members(id),
      FOREIGN KEY(related_expense_id) REFERENCES finance_expenses(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_finance_settlements_ledger ON finance_settlements(ledger_id);
  `);

  const expenseCols = db
    .prepare(`PRAGMA table_info(finance_expenses)`)
    .all() as Array<{ name: string }>;
  const expenseColNames = new Set(expenseCols.map((c) => c.name));
  if (!expenseColNames.has("receipt_path")) {
    db.exec(`ALTER TABLE finance_expenses ADD COLUMN receipt_path TEXT`);
  }
  if (!expenseColNames.has("category_label")) {
    db.exec(`ALTER TABLE finance_expenses ADD COLUMN category_label TEXT`);
  }
  if (!expenseColNames.has("category_tone")) {
    db.exec(`ALTER TABLE finance_expenses ADD COLUMN category_tone TEXT`);
  }
  if (!expenseColNames.has("ai_image_path")) {
    db.exec(`ALTER TABLE finance_expenses ADD COLUMN ai_image_path TEXT`);
  }
  if (!expenseColNames.has("ai_image_prompt")) {
    db.exec(`ALTER TABLE finance_expenses ADD COLUMN ai_image_prompt TEXT`);
  }
  if (!expenseColNames.has("place_name")) {
    db.exec(`ALTER TABLE finance_expenses ADD COLUMN place_name TEXT`);
  }
  if (!expenseColNames.has("place_lat")) {
    db.exec(`ALTER TABLE finance_expenses ADD COLUMN place_lat REAL`);
  }
  if (!expenseColNames.has("place_lon")) {
    db.exec(`ALTER TABLE finance_expenses ADD COLUMN place_lon REAL`);
  }
  if (!expenseColNames.has("notified_at")) {
    db.exec(`ALTER TABLE finance_expenses ADD COLUMN notified_at TEXT`);
  }
  if (!expenseColNames.has("note")) {
    db.exec(`ALTER TABLE finance_expenses ADD COLUMN note TEXT`);
  }
  if (!expenseColNames.has("direction")) {
    db.exec(
      `ALTER TABLE finance_expenses ADD COLUMN direction TEXT NOT NULL DEFAULT 'expense'`
    );
  }
  if (!expenseColNames.has("pre_settled")) {
    db.exec(
      `ALTER TABLE finance_expenses ADD COLUMN pre_settled INTEGER NOT NULL DEFAULT 0`
    );
  }

  const ledgerCols = db
    .prepare(`PRAGMA table_info(finance_ledgers)`)
    .all() as Array<{ name: string }>;
  const ledgerColNames = new Set(ledgerCols.map((c) => c.name));
  if (!ledgerColNames.has("ledger_kind")) {
    db.exec(
      `ALTER TABLE finance_ledgers ADD COLUMN ledger_kind TEXT NOT NULL DEFAULT 'split'`
    );
  }
  if (!ledgerColNames.has("cover_path")) {
    db.exec(`ALTER TABLE finance_ledgers ADD COLUMN cover_path TEXT`);
  }
  if (!ledgerColNames.has("cover_prompt")) {
    db.exec(`ALTER TABLE finance_ledgers ADD COLUMN cover_prompt TEXT`);
  }

  const settlementCols = db
    .prepare(`PRAGMA table_info(finance_settlements)`)
    .all() as Array<{ name: string }>;
  const settlementColNames = new Set(settlementCols.map((c) => c.name));
  if (!settlementColNames.has("notified_at")) {
    db.exec(`ALTER TABLE finance_settlements ADD COLUMN notified_at TEXT`);
  }
  if (!settlementColNames.has("related_expense_id")) {
    db.exec(
      `ALTER TABLE finance_settlements ADD COLUMN related_expense_id INTEGER`
    );
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_finance_settlements_expense ON finance_settlements(related_expense_id)`
  );

  const memberCols = db
    .prepare(`PRAGMA table_info(finance_ledger_members)`)
    .all() as Array<{ name: string }>;
  const memberColNames = new Set(memberCols.map((c) => c.name));
  if (!memberColNames.has("user_id")) {
    db.exec(`ALTER TABLE finance_ledger_members ADD COLUMN user_id INTEGER`);
  }
  if (!memberColNames.has("couple_id")) {
    db.exec(`ALTER TABLE finance_ledger_members ADD COLUMN couple_id INTEGER`);
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_finance_ledger_members_user
       ON finance_ledger_members(user_id)`
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_finance_ledger_members_couple
       ON finance_ledger_members(couple_id)`
  );
  db.exec(`
    CREATE TABLE IF NOT EXISTS finance_ledger_couple_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(ledger_id) REFERENCES finance_ledgers(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_finance_ledger_couples_ledger
      ON finance_ledger_couple_groups(ledger_id);
  `);
}

function ensureUsersTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      gender TEXT,
      avatar_path TEXT,
      avatar_prompt TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      show_today_hub INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);
  `);
  const cols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{
    name: string;
  }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("gender")) {
    db.exec(`ALTER TABLE users ADD COLUMN gender TEXT`);
  }
  if (!names.has("avatar_path")) {
    db.exec(`ALTER TABLE users ADD COLUMN avatar_path TEXT`);
  }
  if (!names.has("avatar_prompt")) {
    db.exec(`ALTER TABLE users ADD COLUMN avatar_prompt TEXT`);
  }
  if (!names.has("show_today_hub")) {
    db.exec(
      `ALTER TABLE users ADD COLUMN show_today_hub INTEGER NOT NULL DEFAULT 0`
    );
  }
  if (!names.has("is_admin")) {
    db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
  }
  if (!names.has("notification_prefs")) {
    db.exec(`ALTER TABLE users ADD COLUMN notification_prefs TEXT`);
  }
}

function ensureFamilyMembersTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS family_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      aliases TEXT,
      gender TEXT,
      avatar_path TEXT,
      avatar_prompt TEXT,
      user_id INTEGER,
      sort_key INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_family_members_active
      ON family_members(active);
    CREATE INDEX IF NOT EXISTS idx_family_members_sort
      ON family_members(sort_key);
  `);

  const count = db
    .prepare(`SELECT COUNT(*) AS c FROM family_members`)
    .get() as { c: number };
  if (count.c > 0) return;

  const ts = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO family_members (
       display_name, aliases, gender, avatar_path, avatar_prompt,
       user_id, sort_key, active, created_at, updated_at
     ) VALUES (?, ?, ?, NULL, NULL, NULL, ?, 1, ?, ?)`
  );
  const defaults: Array<[string, string, string, number]> = [
    ["Rolf", JSON.stringify(["Rolf Walker"]), "male", 0],
    ["Valentyna", JSON.stringify(["Valentyna Walker"]), "female", 1],
    ["Dariusch", JSON.stringify(["Dariusch Walker"]), "male", 2],
  ];
  const seed = db.transaction(() => {
    for (const [name, aliases, gender, sortKey] of defaults) {
      insert.run(name, aliases, gender, sortKey, ts, ts);
    }
  });
  seed();
}

function ensureTripTravelersTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trip_travelers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT,
      user_id INTEGER,
      sort_key INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trip_travelers_trip
      ON trip_travelers(trip_id);
  `);
}

function ensureUserAccessTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_trip_access (
      user_id INTEGER NOT NULL,
      trip_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, trip_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_user_trip_access_trip ON user_trip_access(trip_id);

    CREATE TABLE IF NOT EXISTS user_ledger_access (
      user_id INTEGER NOT NULL,
      ledger_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, ledger_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(ledger_id) REFERENCES finance_ledgers(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_user_ledger_access_ledger ON user_ledger_access(ledger_id);
  `);
}
