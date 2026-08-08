import { getDb } from "@/lib/db/client";

export type BuddyEntityType =
  | "document"
  | "shipment"
  | "appointment"
  | "trip_leg"
  | "deadline"
  | "task"
  | "mail_message";

export type BuddySourceKind =
  | "paperless"
  | "gmail_message"
  | "gmail_thread"
  | "microsoft_message"
  | "drive_file"
  | "google_event"
  | "google_task"
  | "trilium"
  | "url";

export type BuddySourceRole = "primary" | "mirror" | "related";

export type BuddySourceLink = {
  id: number;
  entityType: BuddyEntityType;
  entityId: string;
  sourceKind: BuddySourceKind;
  sourceId: string;
  url: string | null;
  label: string | null;
  role: BuddySourceRole;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: number;
  entity_type: string;
  entity_id: string;
  source_kind: string;
  source_id: string;
  url: string | null;
  label: string | null;
  role: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): BuddySourceLink {
  return {
    id: row.id,
    entityType: row.entity_type as BuddyEntityType,
    entityId: row.entity_id,
    sourceKind: row.source_kind as BuddySourceKind,
    sourceId: row.source_id,
    url: row.url,
    label: row.label,
    role: row.role as BuddySourceRole,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Upsert by unique (entity, source_kind, source_id). */
export function upsertBuddySourceLink(input: {
  entityType: BuddyEntityType;
  entityId: string | number;
  sourceKind: BuddySourceKind;
  sourceId: string;
  url?: string | null;
  label?: string | null;
  role?: BuddySourceRole;
}): BuddySourceLink {
  const now = new Date().toISOString();
  const entityId = String(input.entityId);
  getDb()
    .prepare(
      `INSERT INTO buddy_source_links (
         entity_type, entity_id, source_kind, source_id, url, label, role,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id, source_kind, source_id) DO UPDATE SET
         url = excluded.url,
         label = excluded.label,
         role = excluded.role,
         updated_at = excluded.updated_at`
    )
    .run(
      input.entityType,
      entityId,
      input.sourceKind,
      input.sourceId,
      input.url ?? null,
      input.label ?? null,
      input.role ?? "related",
      now,
      now
    );
  return getBuddySourceLink(
    input.entityType,
    entityId,
    input.sourceKind,
    input.sourceId
  )!;
}

export function getBuddySourceLink(
  entityType: BuddyEntityType,
  entityId: string | number,
  sourceKind: BuddySourceKind,
  sourceId: string
): BuddySourceLink | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM buddy_source_links
       WHERE entity_type = ? AND entity_id = ? AND source_kind = ? AND source_id = ?`
    )
    .get(entityType, String(entityId), sourceKind, sourceId) as
    | Row
    | undefined;
  return row ? mapRow(row) : null;
}

export function listBuddySourceLinks(
  entityType: BuddyEntityType,
  entityId: string | number
): BuddySourceLink[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM buddy_source_links
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY
         CASE role WHEN 'primary' THEN 0 WHEN 'mirror' THEN 1 ELSE 2 END,
         created_at ASC`
    )
    .all(entityType, String(entityId)) as Row[];
  return rows.map(mapRow);
}

export function findDriveMirrorForDocument(
  documentId: number
): BuddySourceLink | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM buddy_source_links
       WHERE entity_type = 'document' AND entity_id = ?
         AND source_kind = 'drive_file' AND role = 'mirror'
       LIMIT 1`
    )
    .get(String(documentId)) as Row | undefined;
  return row ? mapRow(row) : null;
}

/** Stable source_id for one Outlook attachment (message + attachment). */
export function microsoftAttachmentSourceId(
  messageId: string,
  attachmentId: string
): string {
  return `${messageId}#${attachmentId}`;
}

/** Already ingested this Outlook PDF into a Buddy document? */
export function findDocumentForMicrosoftAttachment(
  messageId: string,
  attachmentId: string
): BuddySourceLink | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM buddy_source_links
       WHERE entity_type = 'document'
         AND source_kind = 'microsoft_message'
         AND source_id = ?
       LIMIT 1`
    )
    .get(microsoftAttachmentSourceId(messageId, attachmentId)) as
    | Row
    | undefined;
  return row ? mapRow(row) : null;
}

export function countDocumentsFromMicrosoftMail(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT entity_id) as c FROM buddy_source_links
       WHERE entity_type = 'document' AND source_kind = 'microsoft_message'`
    )
    .get() as { c: number };
  return row?.c || 0;
}

export function countDocumentsWithDriveMirror(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT entity_id) as c FROM buddy_source_links
       WHERE entity_type = 'document' AND source_kind = 'drive_file' AND role = 'mirror'`
    )
    .get() as { c: number };
  return row?.c || 0;
}

export function listDocumentIdsMissingDriveMirror(limit = 50): number[] {
  const rows = getDb()
    .prepare(
      `SELECT d.id FROM paperless_documents d
       WHERE NOT EXISTS (
         SELECT 1 FROM buddy_source_links l
         WHERE l.entity_type = 'document'
           AND l.entity_id = CAST(d.id AS TEXT)
           AND l.source_kind = 'drive_file'
           AND l.role = 'mirror'
       )
       ORDER BY d.id ASC
       LIMIT ?`
    )
    .all(limit) as Array<{ id: number }>;
  return rows.map((r) => r.id);
}

export function countDocumentsMissingDriveMirror(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM paperless_documents d
       WHERE NOT EXISTS (
         SELECT 1 FROM buddy_source_links l
         WHERE l.entity_type = 'document'
           AND l.entity_id = CAST(d.id AS TEXT)
           AND l.source_kind = 'drive_file'
           AND l.role = 'mirror'
       )`
    )
    .get() as { c: number };
  return row?.c || 0;
}

export function countPaperlessDocuments(): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) as c FROM paperless_documents`)
    .get() as { c: number };
  return row?.c || 0;
}
