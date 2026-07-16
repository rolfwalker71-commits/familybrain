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
  analyzed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(document_id) REFERENCES paperless_documents(id) ON DELETE CASCADE
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
