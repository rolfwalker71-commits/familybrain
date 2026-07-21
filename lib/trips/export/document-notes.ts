/** Whether to include beleg enrichment notes once per linked document set. */
export function claimDocumentNotesForExport(
  event: {
    documents?: Array<{ id: number }> | null;
    document_notes_md?: string | null;
    show_document_notes?: number | boolean | null;
  },
  seenDocIds: Set<number>,
  seenNotesMd: Set<string>
): boolean {
  if (
    event.show_document_notes === 0 ||
    event.show_document_notes === false ||
    !event.document_notes_md?.trim()
  ) {
    return false;
  }

  const md = event.document_notes_md.trim();
  if (seenNotesMd.has(md)) return false;

  const docs = event.documents || [];
  if (docs.length > 0 && docs.every((d) => seenDocIds.has(d.id))) {
    return false;
  }

  seenNotesMd.add(md);
  for (const d of docs) seenDocIds.add(d.id);
  return true;
}
