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
