import { PaperlessClient } from "./client";
import type { PaperlessDocument, PaperlessTag } from "./types";
import {
  boolToSql,
  BUDDY_CUSTOM_FIELD_NAMES,
  extractNamedBooleanField,
  extractNamedStringField,
  extractPaymentCustomFlags,
} from "./custom-fields";
import {
  getDocumentByPaperlessId,
  getPaperlessSettings,
  upsertDocument,
  backfillPaymentFlagsFromRawMetadata,
} from "@/lib/db/queries";
import { getDb } from "@/lib/db/client";
import { hashContent } from "@/lib/utils/hash";
import {
  DELTA_OVERLAP_MS,
  FULL_RECONCILE_INTERVAL_MS,
  ID_RECONCILE_INTERVAL_MS,
} from "@/lib/jobs/constants";
import {
  getLastFullReconcileAt,
  getLastIdReconcileAt,
  getSyncCursor,
  listLocalActivePaperlessIds,
  setLastFullReconcileAt,
  setLastIdReconcileAt,
  setSyncCursor,
} from "@/lib/jobs/queries";
import { purgeLocalDocumentsByPaperlessIds } from "@/lib/paperless/delete-document";
import { appendPaperlessFieldSyncLogs } from "@/lib/paperless/sync-log";

export type SyncMode = "full" | "delta";

export type SyncResult = {
  mode: SyncMode;
  totalRemote: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  missing: number;
  errors: string[];
  maxModifiedSeen: string | null;
  cursorAdvancedTo: string | null;
  idReconciled: boolean;
  fullReconciled: boolean;
};

export type SyncProgress = {
  phase:
    | "connecting"
    | "syncing"
    | "reconciling"
    | "done";
  mode: SyncMode;
  totalRemote: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  missing: number;
  errors: number;
  currentTitle?: string | null;
  percent: number;
};

export type SyncOptions = {
  mode?: SyncMode | "auto";
  forceIdReconcile?: boolean;
  forceFull?: boolean;
  onProgress?: (progress: SyncProgress) => void;
};

type NameCache = Map<number, string>;

async function resolveNames(
  client: PaperlessClient,
  doc: PaperlessDocument,
  tagCache: NameCache,
  typeCache: NameCache,
  correspondentCache: NameCache
) {
  const tags: { id: number | null; name: string | null }[] = [];

  const rawTags = doc.tags ?? [];
  for (const tag of rawTags) {
    if (typeof tag === "object" && tag !== null) {
      const t = tag as PaperlessTag;
      tags.push({ id: t.id, name: t.name });
      continue;
    }
    const tagId = Number(tag);
    if (!tagCache.has(tagId)) {
      const fetched = await client.getTag(tagId);
      tagCache.set(tagId, fetched?.name ?? `Tag ${tagId}`);
    }
    tags.push({ id: tagId, name: tagCache.get(tagId) ?? null });
  }

  let documentTypeId: number | null = null;
  let documentTypeName: string | null = null;
  if (typeof doc.document_type === "object" && doc.document_type !== null) {
    documentTypeId = doc.document_type.id;
    documentTypeName = doc.document_type.name;
  } else if (typeof doc.document_type === "number") {
    documentTypeId = doc.document_type;
    if (!typeCache.has(documentTypeId)) {
      const fetched = await client.getDocumentType(documentTypeId);
      typeCache.set(documentTypeId, fetched?.name ?? `Typ ${documentTypeId}`);
    }
    documentTypeName = typeCache.get(documentTypeId) ?? null;
  }

  let correspondentId: number | null = null;
  let correspondentName: string | null = null;
  if (typeof doc.correspondent === "object" && doc.correspondent !== null) {
    correspondentId = doc.correspondent.id;
    correspondentName = doc.correspondent.name;
  } else if (typeof doc.correspondent === "number") {
    correspondentId = doc.correspondent;
    if (!correspondentCache.has(correspondentId)) {
      const fetched = await client.getCorrespondent(correspondentId);
      correspondentCache.set(
        correspondentId,
        fetched?.name ?? `Korrespondent ${correspondentId}`
      );
    }
    correspondentName = correspondentCache.get(correspondentId) ?? null;
  }

  return {
    tags,
    documentTypeId,
    documentTypeName,
    correspondentId,
    correspondentName,
  };
}

function calcPercent(processed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((processed / total) * 100));
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function subtractMs(iso: string, ms: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Date(date.getTime() - ms).toISOString();
}

function shouldRunInterval(
  lastIso: string | null,
  intervalMs: number,
  now = Date.now()
): boolean {
  if (!lastIso) return true;
  const last = new Date(lastIso).getTime();
  if (Number.isNaN(last)) return true;
  return now - last >= intervalMs;
}

function createClient(): PaperlessClient {
  const { baseUrl, apiToken, publicUrl } = getPaperlessSettings();
  if (!baseUrl || !apiToken) {
    throw new Error(
      "Paperless URL und API-Token müssen in den Einstellungen hinterlegt sein."
    );
  }
  return new PaperlessClient(baseUrl, apiToken, publicUrl);
}

async function upsertRemoteDocument(
  client: PaperlessClient,
  doc: PaperlessDocument,
  caches: {
    tagCache: NameCache;
    typeCache: NameCache;
    correspondentCache: NameCache;
    customFieldNames: Map<number, string>;
  },
  options?: { source?: "sync" | "webhook" }
): Promise<{ isNew: boolean; changed: boolean; localId: number }> {
  const source = options?.source ?? "sync";
  const resolved = await resolveNames(
    client,
    doc,
    caches.tagCache,
    caches.typeCache,
    caches.correspondentCache
  );
  const payment = extractPaymentCustomFlags(doc, caches.customFieldNames);
  const existing = getDocumentByPaperlessId(doc.id);
  const content = doc.content ?? "";
  const upserted = upsertDocument({
    paperless_id: doc.id,
    title: doc.title ?? null,
    content,
    content_hash: hashContent(content),
    created_date: doc.created_date ?? doc.created ?? null,
    modified_at: doc.modified ?? null,
    added_at: doc.added ?? null,
    document_type_id: resolved.documentTypeId,
    document_type_name: resolved.documentTypeName,
    correspondent_id: resolved.correspondentId,
    correspondent_name: resolved.correspondentName,
    original_file_name: doc.original_file_name ?? null,
    archived_file_name: doc.archived_file_name ?? null,
    paperless_url: client.documentUiUrl(doc.id),
    raw_metadata: JSON.stringify(doc),
    zu_bezahlen: boolToSql(payment.zuBezahlen),
    bezahlt: boolToSql(payment.bezahlt),
    tags: resolved.tags,
  });

  try {
    const forGuide = extractNamedBooleanField(
      doc,
      caches.customFieldNames,
      BUDDY_CUSTOM_FIELD_NAMES.forGuide
    );
    if (forGuide != null) {
      const { setDocumentForGuide } = await import("@/lib/documents/for-guide");
      setDocumentForGuide(upserted.id, forGuide);
    }
  } catch {
    /* optional UDF */
  }

  // Buddy source graph: Paperless primary + optional Drive mirror for new docs
  try {
    const { upsertBuddySourceLink } = await import("@/lib/buddy/source-links");
    upsertBuddySourceLink({
      entityType: "document",
      entityId: upserted.id,
      sourceKind: "paperless",
      sourceId: String(doc.id),
      url: client.documentUiUrl(doc.id),
      label: "Paperless",
      role: "primary",
    });
    if (upserted.isNew) {
      const { mirrorDocumentToDrive } = await import("@/lib/buddy/drive-mirror");
      void mirrorDocumentToDrive(upserted.id).catch((error) => {
        console.warn(
          "[drive-mirror] new doc:",
          error instanceof Error ? error.message : error
        );
      });
    }
  } catch (error) {
    console.warn(
      "[buddy-links]",
      error instanceof Error ? error.message : error
    );
  }

  if (upserted.isNew || upserted.changed) {
    const logs: Parameters<typeof appendPaperlessFieldSyncLogs>[0] = [];
    const base = {
      direction: "pull" as const,
      source,
      documentLocalId: upserted.id,
      paperlessId: doc.id,
      documentTitle: doc.title ?? null,
    };
    const prevZu = existing?.zu_bezahlen ?? null;
    const prevBezahlt = existing?.bezahlt ?? null;
    const nextZu = boolToSql(payment.zuBezahlen);
    const nextBezahlt = boolToSql(payment.bezahlt);
    if (payment.zuBezahlen != null && (upserted.isNew || prevZu !== nextZu)) {
      logs.push({
        ...base,
        status: "ok",
        kind: "payment_flag",
        fieldName: "Zu bezahlen",
        fieldValue: payment.zuBezahlen,
      });
    }
    if (payment.bezahlt != null && (upserted.isNew || prevBezahlt !== nextBezahlt)) {
      logs.push({
        ...base,
        status: "ok",
        kind: "payment_flag",
        fieldName: "Bezahlt",
        fieldValue: payment.bezahlt,
      });
    }

    // Known Buddy UDFs: log on first ingest, and on webhook pulls (debugging)
    if (upserted.isNew || source === "webhook") {
      const buddyReviewed = extractNamedBooleanField(
        doc,
        caches.customFieldNames,
        BUDDY_CUSTOM_FIELD_NAMES.buddyReviewed
      );
      const taxRelevant = extractNamedBooleanField(
        doc,
        caches.customFieldNames,
        BUDDY_CUSTOM_FIELD_NAMES.taxRelevant
      );
      const buddyStatus = extractNamedStringField(
        doc,
        caches.customFieldNames,
        BUDDY_CUSTOM_FIELD_NAMES.buddyStatus
      );
      const amount = extractNamedStringField(
        doc,
        caches.customFieldNames,
        BUDDY_CUSTOM_FIELD_NAMES.amount
      );
      for (const [name, value] of [
        [BUDDY_CUSTOM_FIELD_NAMES.buddyReviewed, buddyReviewed],
        [BUDDY_CUSTOM_FIELD_NAMES.taxRelevant, taxRelevant],
        [BUDDY_CUSTOM_FIELD_NAMES.buddyStatus, buddyStatus],
        [BUDDY_CUSTOM_FIELD_NAMES.amount, amount],
      ] as const) {
        if (value == null || value === "") continue;
        logs.push({
          ...base,
          status: "ok",
          kind: "custom_field",
          fieldName: name,
          fieldValue: value,
          message:
            source === "webhook"
              ? "via Webhook aus Paperless"
              : "aus Paperless gelesen",
        });
      }
    }

    if (logs.length > 0) appendPaperlessFieldSyncLogs(logs);
  }

  return { ...upserted, localId: upserted.id };
}

/** Fetch a remote Paperless document and upsert into the local index. */
export async function ingestPaperlessDocumentById(
  paperlessId: number,
  options?: { source?: "sync" | "webhook" }
): Promise<{ localId: number; paperlessId: number; changed: boolean; isNew: boolean }> {
  const client = createClient();
  const doc = await client.getDocument(paperlessId);
  const customFields = await client.listCustomFields().catch(() => []);
  const customFieldNames = new Map(
    customFields.map((f) => [f.id, f.name] as const)
  );
  const upserted = await upsertRemoteDocument(
    client,
    doc,
    {
      tagCache: new Map(),
      typeCache: new Map(),
      correspondentCache: new Map(),
      customFieldNames,
    },
    { source: options?.source ?? "sync" }
  );
  return {
    localId: upserted.localId,
    paperlessId,
    changed: upserted.changed,
    isNew: upserted.isNew,
  };
}

/** Upload a PDF to Paperless, wait for consumption, upsert locally. */
export async function uploadAndIngestPaperlessDocument(input: {
  buffer: Buffer;
  filename: string;
  title?: string | null;
}): Promise<{ localId: number; paperlessId: number }> {
  const client = createClient();
  const taskId = await client.postDocument(input);
  const paperlessId = await client.waitForPostedDocument(taskId);
  return ingestPaperlessDocumentById(paperlessId);
}

async function syncDocumentPages(
  client: PaperlessClient,
  mode: SyncMode,
  modifiedGte: string | undefined,
  onProgress: (progress: SyncProgress) => void,
  result: SyncResult
): Promise<void> {
  const caches = {
    tagCache: new Map<number, string>(),
    typeCache: new Map<number, string>(),
    correspondentCache: new Map<number, string>(),
    customFieldNames: new Map<number, string>(),
  };

  try {
    const customFields = await client.listCustomFields();
    for (const field of customFields) {
      caches.customFieldNames.set(field.id, field.name);
    }
  } catch (error) {
    result.errors.push(
      `Custom Fields: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let nextUrl: string | undefined;
  let first = true;

  while (first || nextUrl) {
    first = false;
    const page = await client.listDocumentsPage(nextUrl, {
      pageSize: 50,
      ordering: mode === "delta" ? "modified,id" : "-modified",
      modifiedGte,
    });
    if (!result.totalRemote) {
      result.totalRemote = page.count;
    }

    for (const doc of page.results) {
      try {
        const upserted = await upsertRemoteDocument(client, doc, caches);
        result.processed += 1;
        if (upserted.isNew) result.created += 1;
        else if (upserted.changed) result.updated += 1;
        else result.unchanged += 1;
        result.maxModifiedSeen = maxIso(
          result.maxModifiedSeen,
          doc.modified ?? null
        );

        onProgress({
          phase: "syncing",
          mode,
          totalRemote: result.totalRemote,
          processed: result.processed,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          missing: result.missing,
          errors: result.errors.length,
          currentTitle: doc.title ?? `Dokument ${doc.id}`,
          percent: calcPercent(result.processed, result.totalRemote),
        });
      } catch (error) {
        result.errors.push(
          `Dokument ${doc.id}: ${error instanceof Error ? error.message : String(error)}`
        );
        result.processed += 1;
        onProgress({
          phase: "syncing",
          mode,
          totalRemote: result.totalRemote,
          processed: result.processed,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          missing: result.missing,
          errors: result.errors.length,
          currentTitle: doc.title ?? `Dokument ${doc.id}`,
          percent: calcPercent(result.processed, result.totalRemote),
        });
      }
    }

    nextUrl = page.next ?? undefined;
  }

  if (caches.customFieldNames.size > 0) {
    try {
      const filled = backfillPaymentFlagsFromRawMetadata(caches.customFieldNames);
      if (filled > 0) {
        result.updated += filled;
      }
    } catch (error) {
      result.errors.push(
        `Payment-Flags Backfill: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

async function reconcileMissingIds(
  client: PaperlessClient,
  onProgress: (progress: SyncProgress) => void,
  result: SyncResult
): Promise<void> {
  onProgress({
    phase: "reconciling",
    mode: result.mode,
    totalRemote: result.totalRemote,
    processed: result.processed,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    missing: result.missing,
    errors: result.errors.length,
    currentTitle: "Abgleich entfernter Dokumente…",
    percent: result.totalRemote
      ? calcPercent(result.processed, result.totalRemote)
      : 100,
  });

  let remoteIds: number[];
  try {
    remoteIds = await client.listAllDocumentIds();
  } catch (error) {
    // Older Paperless builds may reject fields=id; fall back to full pages.
    remoteIds = [];
    let nextUrl: string | undefined;
    let first = true;
    while (first || nextUrl) {
      first = false;
      const page = await client.listDocumentsPage(nextUrl, {
        pageSize: 100,
        ordering: "id",
      });
      for (const doc of page.results) remoteIds.push(doc.id);
      nextUrl = page.next ?? undefined;
    }
    if (remoteIds.length === 0 && error instanceof Error) {
      result.errors.push(`ID-Abgleich fehlgeschlagen: ${error.message}`);
      return;
    }
  }

  const remoteSet = new Set(remoteIds);
  const localIds = listLocalActivePaperlessIds();
  const missing = localIds.filter((id) => !remoteSet.has(id));

  // Also purge rows already marked missing from older syncs
  const alreadyMissing = (
    getDb()
      .prepare(
        `SELECT paperless_id FROM paperless_documents
         WHERE sync_status = 'missing'`
      )
      .all() as Array<{ paperless_id: number }>
  ).map((r) => r.paperless_id);

  const toPurge = [...new Set([...missing, ...alreadyMissing])];
  result.missing = await purgeLocalDocumentsByPaperlessIds(toPurge);
  result.idReconciled = true;
  setLastIdReconcileAt(new Date().toISOString());
}

function resolveMode(options: SyncOptions): SyncMode {
  if (options.forceFull) return "full";
  if (options.mode === "full" || options.mode === "delta") return options.mode;
  if (
    shouldRunInterval(
      getLastFullReconcileAt(),
      FULL_RECONCILE_INTERVAL_MS
    )
  ) {
    return "full";
  }
  const cursor = getSyncCursor();
  return cursor ? "delta" : "full";
}

export async function syncPaperlessDocuments(
  onProgressOrOptions?: ((progress: SyncProgress) => void) | SyncOptions
): Promise<SyncResult> {
  const options: SyncOptions =
    typeof onProgressOrOptions === "function"
      ? { onProgress: onProgressOrOptions }
      : onProgressOrOptions ?? {};

  const emit = (progress: SyncProgress) => {
    options.onProgress?.(progress);
  };

  const mode = resolveMode(options);
  const client = createClient();

  const result: SyncResult = {
    mode,
    totalRemote: 0,
    processed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    missing: 0,
    errors: [],
    maxModifiedSeen: null,
    cursorAdvancedTo: null,
    idReconciled: false,
    fullReconciled: false,
  };

  emit({
    phase: "connecting",
    mode,
    totalRemote: 0,
    processed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    missing: 0,
    errors: 0,
    percent: 0,
  });

  const cursor = getSyncCursor();
  const modifiedGte =
    mode === "delta" && cursor
      ? subtractMs(cursor, DELTA_OVERLAP_MS)
      : undefined;

  await syncDocumentPages(client, mode, modifiedGte, emit, result);

  const now = Date.now();
  const runIdReconcile =
    mode === "full" ||
    options.forceIdReconcile ||
    shouldRunInterval(getLastIdReconcileAt(), ID_RECONCILE_INTERVAL_MS, now);

  if (runIdReconcile) {
    await reconcileMissingIds(client, emit, result);
  }

  if (
    mode === "full" ||
    shouldRunInterval(getLastFullReconcileAt(), FULL_RECONCILE_INTERVAL_MS, now)
  ) {
    result.fullReconciled = mode === "full";
    if (mode === "full") {
      setLastFullReconcileAt(new Date().toISOString());
    }
  }

  // Advance cursor only when the crawl itself had no per-document errors.
  if (result.errors.length === 0) {
    const nextCursor =
      result.maxModifiedSeen ??
      (mode === "full" ? new Date().toISOString() : cursor);
    if (nextCursor) {
      setSyncCursor(nextCursor);
      result.cursorAdvancedTo = nextCursor;
    }
    if (mode === "full") {
      setLastFullReconcileAt(new Date().toISOString());
      result.fullReconciled = true;
    }
  }

  emit({
    phase: "done",
    mode,
    totalRemote: result.totalRemote,
    processed: result.processed,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    missing: result.missing,
    errors: result.errors.length,
    percent: 100,
  });

  return result;
}
