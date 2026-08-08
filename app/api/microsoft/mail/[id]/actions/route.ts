import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasMicrosoftCalendarScope,
  hasMicrosoftMailScope,
  hasMicrosoftTasksScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { MailActionsBodySchema } from "@/lib/mail/mail-action-schema";
import { getMicrosoftMessage } from "@/lib/microsoft/mail-inbox";
import {
  getMailAnalysis,
  updateMailAnalysisStatus,
} from "@/lib/mail/mail-analysis-store";
import { createReferenceNote } from "@/lib/mail/reference-notes";
import { recordMailSenderApplied } from "@/lib/mail/mail-sender-prefs";
import { notesWithMember, titleWithMember } from "@/lib/mail/member-notes";
import {
  createOutlookCalendarEvent,
  createOutlookTodoTask,
} from "@/lib/microsoft/mail-day-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  }
  if (
    userId == null ||
    !isMicrosoftConnected(userId) ||
    !hasMicrosoftMailScope(userId)
  ) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }

  let body: ReturnType<typeof MailActionsBodySchema.parse>;
  try {
    body = MailActionsBodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  const stored = getMailAnalysis(userId, id, "microsoft");
  let mailFrom = "";
  let fromEmail = stored?.fromEmail || null;
  try {
    const message = await getMicrosoftMessage(userId, id);
    mailFrom = message.fromName;
    fromEmail = message.from || fromEmail;
  } catch {
    mailFrom = stored?.fromName || "";
  }

  const memberDisplayName =
    body.memberDisplayName?.trim() ||
    stored?.analysis?.suggestedMember?.displayName ||
    null;

  const created: Array<{
    kind: string;
    title: string;
    ok: boolean;
    error?: string;
    link?: string | null;
  }> = [];

  for (const action of body.actions) {
    const base = notesWithMember(action.notes, memberDisplayName);
    const fromLine =
      mailFrom && !base.toLowerCase().includes(`von: ${mailFrom}`.toLowerCase())
        ? `Von: ${mailFrom}`
        : null;
    const notes = [base || null, fromLine].filter(Boolean).join("\n\n");
    const actionTitle = titleWithMember(action.title, memberDisplayName);

    if (action.kind === "event") {
      if (!hasMicrosoftCalendarScope(userId)) {
        created.push({
          kind: "event",
          title: actionTitle,
          ok: false,
          error: "Kalender-Recht fehlt",
        });
        continue;
      }
      try {
        const ev = await createOutlookCalendarEvent(userId, {
          title: actionTitle,
          date: action.startDate || new Date().toISOString().slice(0, 10),
          startTime: action.startTime,
          endTime: action.endTime,
          allDay: action.allDay ?? !action.startTime,
          location: action.location,
          notes: notes || null,
        });
        created.push({
          kind: "event",
          title: actionTitle,
          ok: true,
          link: ev.webLink,
        });
      } catch (err) {
        created.push({
          kind: "event",
          title: actionTitle,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    if (action.kind === "finance") {
      try {
        const { upsertBuddySourceLink } = await import(
          "@/lib/buddy/source-links"
        );
        let documentId = action.documentId ?? null;
        if (documentId == null && (action.vendor || action.amount != null)) {
          const { matchOpenInvoiceFromMail } = await import(
            "@/lib/mail/match-finance"
          );
          const match = matchOpenInvoiceFromMail({
            vendor: action.vendor,
            amount: action.amount,
            currency: action.currency,
          });
          if (match) documentId = match.documentId;
        }

        // If still no doc: ingest PDF attachments from this mail
        if (documentId == null) {
          try {
            const { ingestMicrosoftMessagePdfs } = await import(
              "@/lib/microsoft/mail-to-paperless"
            );
            const { results } = await ingestMicrosoftMessagePdfs({
              userId,
              messageId: id,
            });
            const first = results.find((r) => r.ok && r.localId != null);
            if (first?.localId != null) documentId = first.localId;
          } catch {
            /* optional */
          }
        }

        let link: string | null = null;
        if (documentId != null) {
          upsertBuddySourceLink({
            entityType: "document",
            entityId: String(documentId),
            sourceKind: "microsoft_message",
            sourceId: id,
            label: "O365",
            role: "related",
          });
          upsertBuddySourceLink({
            entityType: "mail_message",
            entityId: id,
            sourceKind: "url",
            sourceId: `document:${documentId}`,
            url: `/documents/${documentId}`,
            label: "Beleg",
            role: "related",
          });
          link = `/documents/${documentId}`;
        }

        if (hasMicrosoftTasksScope(userId)) {
          const task = await createOutlookTodoTask(userId, {
            title: actionTitle.startsWith("Rechnung")
              ? actionTitle
              : `Zahlung: ${actionTitle}`,
            notes: [
              notes,
              documentId ? `Buddy-Dokument: /documents/${documentId}` : null,
            ]
              .filter(Boolean)
              .join("\n\n"),
            dueDate: action.dueDate || action.startDate || null,
          });
          link = link || task.webLink;
        }

        created.push({
          kind: "finance",
          title: actionTitle,
          ok: true,
          link,
        });
      } catch (err) {
        created.push({
          kind: "finance",
          title: actionTitle,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    if (action.kind === "task") {
      if (!hasMicrosoftTasksScope(userId)) {
        created.push({
          kind: "task",
          title: actionTitle,
          ok: false,
          error: "Tasks-Recht fehlt",
        });
        continue;
      }
      try {
        const task = await createOutlookTodoTask(userId, {
          title: actionTitle,
          notes: notes || null,
          dueDate: action.dueDate || action.startDate || null,
        });
        created.push({
          kind: "task",
          title: actionTitle,
          ok: true,
          link: task.webLink,
        });
      } catch (err) {
        created.push({
          kind: "task",
          title: actionTitle,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    if (action.kind === "note") {
      try {
        await createReferenceNote({
          userId,
          title: actionTitle,
          body: notes || action.reference || "",
          reference: action.reference || null,
          sourceMessageId: id,
        });
        created.push({ kind: "note", title: actionTitle, ok: true });
      } catch (err) {
        created.push({
          kind: "note",
          title: actionTitle,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    if (action.kind === "trip") {
      if (!action.startDate?.trim()) {
        created.push({
          kind: "trip",
          title: actionTitle,
          ok: false,
          error: "Reisedatum fehlt",
        });
        continue;
      }
      try {
        const { adoptDraftsToTrip } = await import("@/lib/trips/adopt");
        const { coerceTripEventType } = await import("@/lib/trips/constants");
        const { upsertBuddySourceLink } = await import(
          "@/lib/buddy/source-links"
        );
        const tripTitle =
          action.newTripTitle?.trim() ||
          action.title.trim() ||
          "Reise aus Mail";
        const result = await adoptDraftsToTrip({
          tripId: action.tripId ?? null,
          newTripTitle: action.tripId ? null : tripTitle,
          drafts: [
            {
              type: coerceTripEventType(action.tripType),
              title: actionTitle,
              start_date: action.startDate,
              end_date: action.endDate || action.startDate,
              start_time: action.startTime || null,
              end_time: action.endTime || null,
              location: action.location || null,
              provider: action.provider || null,
              booking_reference:
                action.bookingReference || action.reference || null,
              notes: notes || null,
              source_excerpt: `microsoft:${id}`,
            },
          ],
        });
        const ev = result.events[0];
        if (ev) {
          upsertBuddySourceLink({
            entityType: "trip_leg",
            entityId: String(ev.id),
            sourceKind: "microsoft_message",
            sourceId: id,
            label: "O365",
            role: "related",
          });
        }
        upsertBuddySourceLink({
          entityType: "mail_message",
          entityId: id,
          sourceKind: "url",
          sourceId: `trip:${result.trip.id}`,
          url: `/trips/${result.trip.id}`,
          label: "Reise",
          role: "related",
        });
        created.push({
          kind: "trip",
          title: actionTitle,
          ok: true,
          link: `/trips/${result.trip.id}`,
        });
      } catch (err) {
        created.push({
          kind: "trip",
          title: actionTitle,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    created.push({
      kind: action.kind,
      title: actionTitle,
      ok: false,
      error: "Für O365 noch nicht unterstützt",
    });
  }

  const okCount = created.filter((c) => c.ok).length;
  if (okCount > 0) {
    updateMailAnalysisStatus(userId, id, "applied", "microsoft");
    recordMailSenderApplied(userId, fromEmail);
  }

  return NextResponse.json({
    ok: okCount > 0,
    okCount,
    created,
  });
}
