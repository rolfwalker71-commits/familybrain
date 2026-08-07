import { getCalendarAgenda } from "@/lib/calendar/agenda-feed";
import { findConflictsAgainstProposed } from "@/lib/calendar/event-overlap";
import {
  findMailAppliedLinkByReference,
  listMailAppliedLinksByThread,
} from "@/lib/mail/mail-applied-links";
import { getDb } from "@/lib/db/client";

export type ApplyWarning = {
  code: "duplicate_reference" | "duplicate_thread_event" | "calendar_conflict";
  message: string;
  detail?: string;
};

export type ApplyCheckAction = {
  kind: "event" | "task" | "note" | "trip";
  title: string;
  reference?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  patchEventId?: string | null;
};

function findReferenceNoteByReference(
  userId: number,
  reference: string
): { title: string } | null {
  const ref = reference.trim();
  if (!ref) return null;
  const row = getDb()
    .prepare(
      `SELECT title FROM reference_notes
       WHERE user_id = ? AND reference = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(userId, ref) as { title: string } | undefined;
  return row || null;
}

/**
 * Soft pre-apply checks: duplicate tracking / thread events / calendar overlaps.
 */
export async function collectApplyWarnings(
  userId: number,
  threadId: string | null | undefined,
  actions: ApplyCheckAction[]
): Promise<ApplyWarning[]> {
  const warnings: ApplyWarning[] = [];
  const threadLinks = threadId
    ? listMailAppliedLinksByThread(userId, threadId)
    : [];

  for (const action of actions) {
    const ref = action.reference?.trim();
    if (ref) {
      const link = findMailAppliedLinkByReference(userId, ref);
      if (link) {
        warnings.push({
          code: "duplicate_reference",
          message: `Referenz «${ref}» wurde schon übernommen («${link.title}»).`,
          detail: link.title,
        });
      }
      const note = findReferenceNoteByReference(userId, ref);
      if (note) {
        warnings.push({
          code: "duplicate_reference",
          message: `Referenz «${ref}» existiert schon als Notiz («${note.title}»).`,
          detail: note.title,
        });
      }
    }

    if (
      action.kind === "event" &&
      !action.patchEventId &&
      action.startDate &&
      threadLinks.some(
        (l) =>
          l.kind === "event" &&
          l.startDate === action.startDate &&
          titlesSimilar(l.title, action.title)
      )
    ) {
      warnings.push({
        code: "duplicate_thread_event",
        message: `Im Thread gibt es schon einen ähnlichen Termin («${action.title}»). Besser patchen statt neu anlegen.`,
      });
    }
  }

  const eventActions = actions.filter(
    (a) =>
      a.kind === "event" &&
      a.startDate &&
      a.startTime &&
      !a.patchEventId
  );
  if (eventActions.length > 0) {
    try {
      const dates = [
        ...new Set(
          eventActions.map((a) => a.startDate!.slice(0, 10)).filter(Boolean)
        ),
      ];
      const agenda = await getCalendarAgenda({
        userId,
        range: "14d",
      });
      const existing = (agenda.items || [])
        .filter(
          (i) =>
            i.time &&
            i.planningRelevant !== false &&
            dates.includes(i.date)
        )
        .map((i) => ({
          id: i.id,
          title: i.title,
          date: i.date,
          time: i.time!,
          endTime: i.endTime,
          planningRelevant: i.planningRelevant,
        }));

      for (const action of eventActions) {
        const conflicts = findConflictsAgainstProposed(existing, {
          id: `mail:${action.title}`,
          title: action.title,
          date: action.startDate!.slice(0, 10),
          time: action.startTime!.slice(0, 5),
          endTime: action.endTime || null,
        });
        for (const c of conflicts) {
          warnings.push({
            code: "calendar_conflict",
            message: `Termin-Konflikt: ${c.label}`,
            detail: c.id,
          });
        }
      }
    } catch (error) {
      console.warn(
        "[mail] conflict check skipped:",
        error instanceof Error ? error.message : error
      );
    }
  }

  // Dedupe by message
  const seen = new Set<string>();
  return warnings.filter((w) => {
    const key = `${w.code}:${w.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function titlesSimilar(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb.slice(0, 16)) || nb.includes(na.slice(0, 16));
}
