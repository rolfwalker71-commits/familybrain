/** Append mail subject as description line `(Betreff)`. */
export function appendMailSubjectToNotes(
  notes: string | null | undefined,
  subject: string | null | undefined
): string | null {
  const subj = (subject || "").trim();
  if (!subj || subj === "(kein Betreff)") {
    const base = (notes || "").trim();
    return base || null;
  }
  const tag = `(${subj})`;
  const base = (notes || "").trim();
  if (!base) return tag.slice(0, 2000);
  if (base.includes(tag)) return base.slice(0, 2000);
  return `${base}\n${tag}`.slice(0, 2000);
}
