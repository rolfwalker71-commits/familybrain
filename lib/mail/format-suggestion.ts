import type { MailSuggestion } from "@/lib/mail/mail-action-schema";
import { toSwissDate } from "@/lib/utils/dates";

/** Meta line (date/location) — description is edited separately. */
export function formatMailSuggestionDetail(s: MailSuggestion): string {
  if (s.kind === "event") {
    const date = s.startDate ? toSwissDate(s.startDate) : null;
    const when = [date, s.startTime, s.endTime ? `–${s.endTime}` : null]
      .filter(Boolean)
      .join(" ");
    return [when, s.location].filter(Boolean).join(" · ");
  }
  if (s.kind === "note") {
    const ref = s.reference?.trim();
    if (ref) return `Ref. ${ref}`;
    return "Notiz";
  }
  return s.dueDate ? `fällig ${toSwissDate(s.dueDate)}` : "ohne Fälligkeit";
}
