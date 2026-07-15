import { PaperlessClient } from "./client";
import type { PaperlessDocument, PaperlessTag } from "./types";
import { getPaperlessSettings, upsertDocument } from "@/lib/db/queries";
import { hashContent } from "@/lib/utils/hash";

export type SyncResult = {
  totalRemote: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
};

export type SyncProgress = {
  phase: "connecting" | "syncing" | "done";
  totalRemote: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  currentTitle?: string | null;
  percent: number;
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

export async function syncPaperlessDocuments(
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const { baseUrl, apiToken } = getPaperlessSettings();
  if (!baseUrl || !apiToken) {
    throw new Error(
      "Paperless URL und API-Token müssen in den Einstellungen hinterlegt sein."
    );
  }

  const emit = (progress: SyncProgress) => {
    onProgress?.(progress);
  };

  emit({
    phase: "connecting",
    totalRemote: 0,
    processed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    percent: 0,
  });

  const client = new PaperlessClient(baseUrl, apiToken);
  const result: SyncResult = {
    totalRemote: 0,
    processed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  const tagCache: NameCache = new Map();
  const typeCache: NameCache = new Map();
  const correspondentCache: NameCache = new Map();

  let nextUrl: string | undefined;
  let first = true;

  while (first || nextUrl) {
    first = false;
    const page = await client.listDocumentsPage(nextUrl);
    if (!result.totalRemote) {
      result.totalRemote = page.count;
    }

    for (const doc of page.results) {
      try {
        const resolved = await resolveNames(
          client,
          doc,
          tagCache,
          typeCache,
          correspondentCache
        );
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
          tags: resolved.tags,
        });

        result.processed += 1;
        if (upserted.isNew) result.created += 1;
        else if (upserted.changed) result.updated += 1;
        else result.unchanged += 1;

        emit({
          phase: "syncing",
          totalRemote: result.totalRemote,
          processed: result.processed,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          errors: result.errors.length,
          currentTitle: doc.title ?? `Dokument ${doc.id}`,
          percent: calcPercent(result.processed, result.totalRemote),
        });
      } catch (error) {
        result.errors.push(
          `Dokument ${doc.id}: ${error instanceof Error ? error.message : String(error)}`
        );
        result.processed += 1;
        emit({
          phase: "syncing",
          totalRemote: result.totalRemote,
          processed: result.processed,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          errors: result.errors.length,
          currentTitle: doc.title ?? `Dokument ${doc.id}`,
          percent: calcPercent(result.processed, result.totalRemote),
        });
      }
    }

    nextUrl = page.next ?? undefined;
  }

  emit({
    phase: "done",
    totalRemote: result.totalRemote,
    processed: result.processed,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    errors: result.errors.length,
    percent: 100,
  });

  return result;
}
