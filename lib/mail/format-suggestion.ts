import type { MailSuggestion } from "@/lib/mail/mail-action-schema";
import { toSwissDate } from "@/lib/utils/dates";

function withNotesLine(detail: string, s: MailSuggestion): string {
  const notes = s.notes?.trim();
  if (!notes) return detail;
  if (!detail) return notes;
  if (detail.includes(notes)) return detail;
  return `${detail} · ${notes}`;
}

/** Human-readable suggestion line (EU dates). */
export function formatMailSuggestionDetail(s: MailSuggestion): string {
  if (s.kind === "event") {
    const date = s.startDate ? toSwissDate(s.startDate) : null;
    const when = [date, s.startTime, s.endTime ? `–${s.endTime}` : null]
      .filter(Boolean)
      .join(" ");
    return withNotesLine([when, s.location].filter(Boolean).join(" · "), s);
  }
  if (s.kind === "note") {
    const ref = s.reference?.trim();
    if (ref) return withNotesLine(`Ref. ${ref}`, s);
    return s.notes?.trim() || "Notiz";
  }
  return withNotesLine(
    s.dueDate ? `fällig ${toSwissDate(s.dueDate)}` : "ohne Fälligkeit",
    s
  );
}
