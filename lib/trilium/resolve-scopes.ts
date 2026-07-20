import type { TriliumClient } from "./client";
import {
  TRILIUM_MASTER_TITLE,
  TRILIUM_SCOPE_GESCHAEFTLICH_TITLE,
  TRILIUM_SCOPE_PRIVAT_TITLE,
} from "./constants";

export type TriliumResolvedScopes = {
  masterNoteId: string;
  privatNoteId: string;
  geschaeftlichNoteId: string;
};

function titleQuery(title: string): string {
  return `note.title = '${title.replace(/'/g, "''")}'`;
}

export async function resolveTriliumScopes(
  client: TriliumClient
): Promise<TriliumResolvedScopes> {
  const masters = await client.searchNotes(titleQuery(TRILIUM_MASTER_TITLE), {
    limit: 20,
  });

  for (const master of masters.results) {
    const privat = await client.searchNotes(
      titleQuery(TRILIUM_SCOPE_PRIVAT_TITLE),
      { ancestorNoteId: master.noteId, limit: 5 }
    );
    const geschaeftlich = await client.searchNotes(
      titleQuery(TRILIUM_SCOPE_GESCHAEFTLICH_TITLE),
      { ancestorNoteId: master.noteId, limit: 5 }
    );

    if (privat.results.length > 0 && geschaeftlich.results.length > 0) {
      return {
        masterNoteId: master.noteId,
        privatNoteId: privat.results[0].noteId,
        geschaeftlichNoteId: geschaeftlich.results[0].noteId,
      };
    }
  }

  throw new Error(
    `Konnte «${TRILIUM_MASTER_TITLE} → ${TRILIUM_SCOPE_PRIVAT_TITLE}» und «${TRILIUM_SCOPE_GESCHAEFTLICH_TITLE}» in Trilium nicht finden.`
  );
}
