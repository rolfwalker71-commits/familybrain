import {
  getTriliumScopeLabel,
  getTriliumSettings,
  isTriliumConfigured,
  listLocalTriliumNoteIds,
  markTriliumNotesMissing,
  upsertTriliumNote,
} from "@/lib/db/queries";
import {
  DELTA_OVERLAP_MS,
  FULL_RECONCILE_INTERVAL_MS,
} from "@/lib/jobs/constants";
import {
  getTriliumInitialSyncComplete,
  getTriliumLastFullReconcileAt,
  getTriliumSyncCursor,
  setTriliumInitialSyncComplete,
  setTriliumLastFullReconcileAt,
  setTriliumSyncCursor,
} from "@/lib/jobs/queries";
import type { TriliumClient, TriliumNote } from "./client";
import { TriliumClient as TriliumClientClass } from "./client";
import {
  TRILIUM_ALL_NOTES_SEARCH,
  TRILIUM_SCOPE_GESCHAEFTLICH_TITLE,
  TRILIUM_SCOPE_PRIVAT_TITLE,
  type TriliumScopeKey,
} from "./constants";
import { htmlToPlainText } from "./html-to-text";

export type TriliumSyncMode = "full" | "delta";

export type TriliumSyncResult = {
  mode: TriliumSyncMode;
  totalRemote: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  missing: number;
  errors: string[];
  maxModifiedSeen: string | null;
  cursorAdvancedTo: string | null;
  fullReconciled: boolean;
};

export type TriliumSyncProgress = {
  phase: "connecting" | "syncing" | "reconciling" | "done";
  mode: TriliumSyncMode;
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

export type TriliumSyncOptions = {
  mode?: TriliumSyncMode | "auto";
  forceFull?: boolean;
  onProgress?: (progress: TriliumSyncProgress) => void;
};

type ScopeConfig = {
  key: TriliumScopeKey;
  noteId: string;
  label: string;
};

function calcPercent(processed: number, total: number): number {
  if (total <= 0) return processed > 0 ? 100 : 0;
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

function createClient(): TriliumClient {
  const { baseUrl, apiToken } = getTriliumSettings();
  if (!baseUrl || !apiToken) {
    throw new Error(
      "Trilium URL und ETAPI-Token müssen in den Einstellungen hinterlegt sein."
    );
  }
  return new TriliumClientClass(baseUrl, apiToken);
}

function getScopeConfigs(): ScopeConfig[] {
  const settings = getTriliumSettings();
  if (!settings.privatNoteId || !settings.geschaeftlichNoteId) {
    throw new Error(
      "Trilium-Bereiche fehlen. Bitte unter Einstellungen «Bereiche erkennen» ausführen."
    );
  }
  return [
    {
      key: "privat",
      noteId: settings.privatNoteId,
      label: TRILIUM_SCOPE_PRIVAT_TITLE,
    },
    {
      key: "geschaeftlich",
      noteId: settings.geschaeftlichNoteId,
      label: TRILIUM_SCOPE_GESCHAEFTLICH_TITLE,
    },
  ];
}

async function crawlSubtreeNotes(
  client: TriliumClient,
  rootNoteId: string
): Promise<TriliumNote[]> {
  const notes: TriliumNote[] = [];
  const seen = new Set<string>();
  const queue = [rootNoteId];

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    if (seen.has(parentId)) continue;
    seen.add(parentId);

    const response = await client.searchNotes(TRILIUM_ALL_NOTES_SEARCH, {
      ancestorNoteId: parentId,
      ancestorDepth: "eq1",
      limit: 500,
      fastSearch: true,
    });

    for (const note of response.results) {
      if (note.noteId === parentId || seen.has(note.noteId)) continue;
      seen.add(note.noteId);
      notes.push(note);
      queue.push(note.noteId);
    }
  }

  return notes;
}

async function searchModifiedNotes(
  client: TriliumClient,
  scopeNoteId: string,
  modifiedGte: string
): Promise<TriliumNote[]> {
  const response = await client.searchNotes(
    `note.utcDateModified > '${modifiedGte.replace(/'/g, "''")}'`,
    {
      ancestorNoteId: scopeNoteId,
      limit: 500,
      fastSearch: true,
      orderBy: "utcDateModified",
      orderDirection: "asc",
    }
  );
  return response.results;
}

async function syncNoteContent(
  client: TriliumClient,
  note: TriliumNote,
  scope: ScopeConfig
): Promise<{ isNew: boolean; changed: boolean }> {
  let contentText = "";
  let isProtected = false;

  try {
    const html = await client.getNoteContent(note.noteId);
    contentText = htmlToPlainText(html, 50_000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("403") || message.toLowerCase().includes("protected")) {
      isProtected = true;
    } else {
      throw error;
    }
  }

  return upsertTriliumNote({
    noteId: note.noteId,
    scope: scope.key,
    title: note.title || null,
    noteType: note.type ?? null,
    contentText,
    dateModified: note.dateModified ?? null,
    triliumUrl: client.noteUrl(note.noteId),
    isProtected,
  });
}

function resolveMode(options: TriliumSyncOptions): TriliumSyncMode {
  if (options.forceFull) return "full";
  if (options.mode === "full" || options.mode === "delta") return options.mode;
  if (
    shouldRunInterval(
      getTriliumLastFullReconcileAt(),
      FULL_RECONCILE_INTERVAL_MS
    )
  ) {
    return "full";
  }
  return getTriliumSyncCursor() ? "delta" : "full";
}

export async function syncTriliumNotes(
  onProgressOrOptions?: ((progress: TriliumSyncProgress) => void) | TriliumSyncOptions
): Promise<TriliumSyncResult> {
  if (!isTriliumConfigured()) {
    throw new Error("Trilium ist nicht vollständig konfiguriert.");
  }

  const options: TriliumSyncOptions =
    typeof onProgressOrOptions === "function"
      ? { onProgress: onProgressOrOptions }
      : onProgressOrOptions ?? {};

  const emit = (progress: TriliumSyncProgress) => {
    options.onProgress?.(progress);
  };

  const mode = resolveMode(options);
  const client = createClient();
  const scopes = getScopeConfigs();

  const result: TriliumSyncResult = {
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

  const cursor = getTriliumSyncCursor();
  const modifiedGte =
    mode === "delta" && cursor
      ? subtractMs(cursor, DELTA_OVERLAP_MS)
      : undefined;

  for (const scope of scopes) {
    const remoteNotes =
      mode === "full" || !modifiedGte
        ? await crawlSubtreeNotes(client, scope.noteId)
        : await searchModifiedNotes(client, scope.noteId, modifiedGte);

    result.totalRemote += remoteNotes.length;

    for (const note of remoteNotes) {
      try {
        const upserted = await syncNoteContent(client, note, scope);
        result.processed += 1;
        if (upserted.isNew) result.created += 1;
        else if (upserted.changed) result.updated += 1;
        else result.unchanged += 1;
        result.maxModifiedSeen = maxIso(
          result.maxModifiedSeen,
          note.dateModified ?? null
        );

        emit({
          phase: "syncing",
          mode,
          totalRemote: result.totalRemote,
          processed: result.processed,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          missing: result.missing,
          errors: result.errors.length,
          currentTitle: `${getTriliumScopeLabel(scope.key)} · ${note.title || note.noteId}`,
          percent: calcPercent(result.processed, result.totalRemote),
        });
      } catch (error) {
        result.errors.push(
          `${scope.label} / ${note.title || note.noteId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        result.processed += 1;
        emit({
          phase: "syncing",
          mode,
          totalRemote: result.totalRemote,
          processed: result.processed,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          missing: result.missing,
          errors: result.errors.length,
          currentTitle: `${scope.label} · ${note.title || note.noteId}`,
          percent: calcPercent(result.processed, result.totalRemote),
        });
      }
    }

    if (mode === "full") {
      emit({
        phase: "reconciling",
        mode,
        totalRemote: result.totalRemote,
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        missing: result.missing,
        errors: result.errors.length,
        currentTitle: `${scope.label}: Abgleich…`,
        percent: calcPercent(result.processed, result.totalRemote),
      });

      const remoteIds = new Set(remoteNotes.map((note) => note.noteId));
      const localIds = listLocalTriliumNoteIds(scope.key);
      const missingIds = localIds.filter((noteId) => !remoteIds.has(noteId));
      result.missing += markTriliumNotesMissing(missingIds, scope.key);
    }
  }

  if (result.errors.length === 0) {
    const nextCursor =
      result.maxModifiedSeen ??
      (mode === "full" ? new Date().toISOString() : cursor);
    if (nextCursor) {
      setTriliumSyncCursor(nextCursor);
      result.cursorAdvancedTo = nextCursor;
    }
    if (mode === "full") {
      setTriliumLastFullReconcileAt(new Date().toISOString());
      result.fullReconciled = true;
      setTriliumInitialSyncComplete(true);
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
