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
  if (s.kind === "trip") {
    const date = s.startDate ? toSwissDate(s.startDate) : null;
    const when = [date, s.startTime].filter(Boolean).join(" ");
    const bits = [
      s.tripType?.trim() || "Reise",
      when,
      s.provider?.trim() || null,
      s.bookingReference?.trim()
        ? `Ref. ${s.bookingReference.trim()}`
        : null,
      s.location?.trim() || null,
    ];
    return bits.filter(Boolean).join(" · ");
  }
  if (s.kind === "finance") {
    const bits = [
      s.vendor?.trim() || null,
      s.amount != null
        ? `${s.amount.toFixed(2)} ${s.currency || "CHF"}`
        : null,
      s.dueDate ? `fällig ${toSwissDate(s.dueDate)}` : null,
      s.documentId ? `Doc #${s.documentId}` : null,
    ];
    return bits.filter(Boolean).join(" · ") || "Zahlung";
  }
  if (s.kind === "note") {
    const ref = s.reference?.trim();
    if (ref) return `Ref. ${ref}`;
    return "Notiz";
  }
  return s.dueDate ? `fällig ${toSwissDate(s.dueDate)}` : "ohne Fälligkeit";
}
