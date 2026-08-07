import type { MailSuggestion } from "@/lib/mail/mail-action-schema";

/** Append «Für: Name» when applying with a family member. */
export function notesWithMember(
  notes: string | null | undefined,
  displayName: string | null | undefined
): string {
  const base = (notes || "").trim();
  const name = (displayName || "").trim();
  if (!name) return base;
  const marker = `Für: ${name}`;
  if (base.toLowerCase().includes(`für: ${name.toLowerCase()}`)) return base;
  return base ? `${marker}\n\n${base}` : marker;
}

export function titleWithMember(
  title: string,
  displayName: string | null | undefined
): string {
  const name = (displayName || "").trim();
  if (!name) return title;
  if (title.toLowerCase().includes(name.toLowerCase())) return title;
  return `${title} (${name})`;
}

export function isFinanceSuggestion(s: MailSuggestion): boolean {
  return s.kind === "finance";
}
