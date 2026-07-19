import { PaperlessClient } from "./client";
import type { PaperlessDocument, PaperlessTag } from "./types";
import { getPaperlessSettings, upsertDocument } from "@/lib/db/queries";
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
  markDocumentsMissing,
  setLastFullReconcileAt,
  setLastIdReconcileAt,
  setSyncCursor,
} from "@/lib/jobs/queries";

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
  const { baseUrl, apiToken } = getPaperlessSettings();
  if (!baseUrl || !apiToken) {
    throw new Error(
      "Paperless URL und API-Token müssen in den Einstellungen hinterlegt sein."
    );
  }
  return new PaperlessClient(baseUrl, apiToken);
}

async function upsertRemoteDocument(
  client: PaperlessClient,
  doc: PaperlessDocument,
  caches: {
    tagCache: NameCache;
    typeCache: NameCache;
    correspondentCache: NameCache;
  }
): Promise<{ isNew: boolean; changed: boolean }> {
  const resolved = await resolveNames(
    client,
    doc,
    caches.tagCache,
    caches.typeCache,
    caches.correspondentCache
  );
  const content = doc.content ?? "";
  return upsertDocument({
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
    tags: resolved.tags,
  });
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
  };

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
  result.missing = markDocumentsMissing(missing);
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
