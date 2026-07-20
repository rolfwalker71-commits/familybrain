export const TRILIUM_MASTER_TITLE = "Master";
export const TRILIUM_SCOPE_PRIVAT_TITLE = "Privat";
export const TRILIUM_SCOPE_GESCHAEFTLICH_TITLE = "Geschäftlich ANG";

export const TRILIUM_SETTING_KEYS = {
  baseUrl: "trilium_base_url",
  token: "trilium_etapi_token",
  masterNoteId: "trilium_master_note_id",
  privatNoteId: "trilium_scope_privat_note_id",
  geschaeftlichNoteId: "trilium_scope_geschaeftlich_note_id",
} as const;

export type TriliumScopeKey = "privat" | "geschaeftlich";

/** Matches every note – used for subtree crawls via ETAPI search. */
export const TRILIUM_ALL_NOTES_SEARCH = "note.dateModified > 1970-01-01";
