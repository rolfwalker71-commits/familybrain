PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paperless_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paperless_id INTEGER NOT NULL UNIQUE,
  title TEXT,
  content TEXT,
  content_hash TEXT,
  created_date TEXT,
  modified_at TEXT,
  added_at TEXT,
  document_type_id INTEGER,
  document_type_name TEXT,
  correspondent_id INTEGER,
  correspondent_name TEXT,
  original_file_name TEXT,
  archived_file_name TEXT,
  paperless_url TEXT,
  raw_metadata TEXT,
  sync_status TEXT DEFAULT 'synced',
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  tag_id INTEGER,
  tag_name TEXT,
  FOREIGN KEY(document_id) REFERENCES paperless_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE,
  short_summary TEXT,
  detailed_summary TEXT,
  important_points TEXT,
  important_dates TEXT,
  amounts TEXT,
  deadlines TEXT,
  contract_parties TEXT,
  warranty_info TEXT,
  cancellation_terms TEXT,
  category TEXT,
  possible_todos TEXT,
  confidence REAL,
  model_name TEXT,
  analysis_status TEXT DEFAULT 'pending',
  analysis_attempts INTEGER NOT NULL DEFAULT 0,
  analysis_claimed_at TEXT,
  analysis_claim_hash TEXT,
  analysis_next_retry_at TEXT,
  analysis_last_error TEXT,
  analyzed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(document_id) REFERENCES paperless_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL DEFAULT 'sync_analyze',
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  summary_json TEXT,
  error_message TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT
);

CREATE TABLE IF NOT EXISTS job_run_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  item_kind TEXT NOT NULL,
  external_ref TEXT,
  title TEXT,
  status TEXT NOT NULL,
  message TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES job_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS devices_and_warranties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  product_name TEXT,
  manufacturer TEXT,
  vendor TEXT,
  purchase_date TEXT,
  price REAL,
  currency TEXT,
  serial_number TEXT,
  warranty_months INTEGER,
  warranty_until TEXT,
  status TEXT,
  confidence REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(document_id) REFERENCES paperless_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  deadline_date TEXT,
  deadline_type TEXT,
  source_text TEXT,
  status TEXT DEFAULT 'open',
  confidence REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(document_id) REFERENCES paperless_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS financial_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  vendor TEXT,
  amount REAL,
  currency TEXT,
  invoice_date TEXT,
  due_date TEXT,
  category TEXT,
  description TEXT,
  is_recurring INTEGER DEFAULT 0,
  counts_in_stats INTEGER NOT NULL DEFAULT 1,
  confidence REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(document_id) REFERENCES paperless_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS travel_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  travel_type TEXT,
  travel_type_override TEXT,
  provider TEXT,
  title TEXT,
  start_date TEXT,
  end_date TEXT,
  origin TEXT,
  destination TEXT,
  booking_reference TEXT,
  price REAL,
  currency TEXT,
  extracted_data TEXT,
  confidence REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(document_id) REFERENCES paperless_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS classification_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  match_field TEXT NOT NULL,
  match_mode TEXT NOT NULL DEFAULT 'contains',
  match_value TEXT NOT NULL,
  target_value TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_docs_paperless_id ON paperless_documents(paperless_id);
CREATE INDEX IF NOT EXISTS idx_docs_created_date ON paperless_documents(created_date);
CREATE INDEX IF NOT EXISTS idx_docs_modified_at ON paperless_documents(modified_at);
CREATE INDEX IF NOT EXISTS idx_summaries_category ON document_summaries(category);
CREATE INDEX IF NOT EXISTS idx_summaries_status ON document_summaries(analysis_status);
CREATE INDEX IF NOT EXISTS idx_deadlines_date ON deadlines(deadline_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_status ON deadlines(status);
CREATE INDEX IF NOT EXISTS idx_warranties_until ON devices_and_warranties(warranty_until);
CREATE INDEX IF NOT EXISTS idx_tags_document_id ON document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_finance_invoice_date ON financial_items(invoice_date);
CREATE INDEX IF NOT EXISTS idx_travel_start_date ON travel_items(start_date);
CREATE INDEX IF NOT EXISTS idx_classification_rules_domain
  ON classification_rules(domain, enabled, priority);
CREATE INDEX IF NOT EXISTS idx_docs_sync_status ON paperless_documents(sync_status);
CREATE INDEX IF NOT EXISTS idx_job_runs_started ON job_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);
CREATE INDEX IF NOT EXISTS idx_job_run_items_run ON job_run_items(run_id, id);

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
-- idx_trilium_notes_embedding is created in bootstrap after column migration

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

-- User-provided corrections that override conflicting RAG data in chat
CREATE TABLE IF NOT EXISTS chat_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT,
  content TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_corrections_active ON chat_corrections(active);

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
  cabin_class TEXT,
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
  document_notes_md TEXT,
  show_document_notes INTEGER NOT NULL DEFAULT 1,
  document_notes_enriched_at TEXT,
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
CREATE INDEX IF NOT EXISTS idx_trip_share_links_trip ON trip_share_links(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_share_links_token ON trip_share_links(token);

-- FinanzBrain: group expense ledgers (Settle-Up style)
CREATE TABLE IF NOT EXISTS finance_ledgers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'CHF',
  trip_id INTEGER,
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
  invite_token TEXT NOT NULL UNIQUE,
  invite_revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(ledger_id) REFERENCES finance_ledgers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_finance_ledger_members_ledger
  ON finance_ledger_members(ledger_id);
CREATE INDEX IF NOT EXISTS idx_finance_ledger_members_token
  ON finance_ledger_members(invite_token);

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
  split_mode TEXT NOT NULL DEFAULT 'equal',
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
  created_at TEXT NOT NULL,
  FOREIGN KEY(ledger_id) REFERENCES finance_ledgers(id) ON DELETE CASCADE,
  FOREIGN KEY(from_member_id) REFERENCES finance_ledger_members(id),
  FOREIGN KEY(to_member_id) REFERENCES finance_ledger_members(id),
  FOREIGN KEY(created_by_member_id) REFERENCES finance_ledger_members(id)
);
CREATE INDEX IF NOT EXISTS idx_finance_settlements_ledger ON finance_settlements(ledger_id);

