import { graphJson } from "@/lib/microsoft/graph";

export type CreateOutlookEventInput = {
  title: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  notes?: string | null;
};

export type CreatedOutlookEvent = {
  id: string;
  subject: string;
  webLink: string | null;
};

export async function createOutlookCalendarEvent(
  userId: number,
  input: CreateOutlookEventInput
): Promise<CreatedOutlookEvent> {
  const allDay = input.allDay || !input.startTime;
  let body: Record<string, unknown>;
  if (allDay) {
    // Graph all-day: end date exclusive
    const endDate = (() => {
      const d = new Date(`${input.date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    body = {
      subject: input.title,
      isAllDay: true,
      start: { dateTime: `${input.date}T00:00:00`, timeZone: "Europe/Zurich" },
      end: { dateTime: `${endDate}T00:00:00`, timeZone: "Europe/Zurich" },
      location: input.location ? { displayName: input.location } : undefined,
      body: input.notes
        ? { contentType: "Text", content: input.notes }
        : undefined,
    };
  } else {
    const startHm = input.startTime || "09:00";
    const endHm =
      input.endTime ||
      (() => {
        const [h, m] = startHm.split(":").map(Number);
        const endH = Math.min(23, (h || 9) + 1);
        return `${String(endH).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
      })();
    body = {
      subject: input.title,
      isAllDay: false,
      start: {
        dateTime: `${input.date}T${startHm}:00`,
        timeZone: "Europe/Zurich",
      },
      end: {
        dateTime: `${input.date}T${endHm}:00`,
        timeZone: "Europe/Zurich",
      },
      location: input.location ? { displayName: input.location } : undefined,
      body: input.notes
        ? { contentType: "Text", content: input.notes }
        : undefined,
    };
  }

  const created = await graphJson<{
    id?: string;
    subject?: string;
    webLink?: string | null;
  }>(userId, "/me/events", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { Prefer: 'outlook.timezone="Europe/Zurich"' },
  });
  if (!created.id) throw new Error("Outlook-Termin ohne ID.");
  return {
    id: created.id,
    subject: created.subject || input.title,
    webLink: created.webLink || null,
  };
}

export type CreateOutlookDraftInput = {
  to: string;
  subject: string;
  body: string;
  /** Wenn gesetzt: Reply-Draft auf diese Inbox-Mail. */
  sourceMailId?: string | null;
};

export type CreatedOutlookDraft = {
  id: string;
  subject: string;
  webLink: string | null;
};

export async function createOutlookMailDraft(
  userId: number,
  input: CreateOutlookDraftInput
): Promise<CreatedOutlookDraft> {
  const to = input.to.trim();
  if (!to.includes("@")) throw new Error("Ungültige Empfänger-Adresse.");

  if (input.sourceMailId) {
    try {
      const draft = await graphJson<{
        id?: string;
        subject?: string;
        webLink?: string | null;
      }>(
        userId,
        `/me/messages/${encodeURIComponent(input.sourceMailId)}/createReply`,
        { method: "POST", body: JSON.stringify({}) }
      );
      if (draft.id) {
        const patched = await graphJson<{
          id?: string;
          subject?: string;
          webLink?: string | null;
        }>(userId, `/me/messages/${encodeURIComponent(draft.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            subject: input.subject,
            body: { contentType: "Text", content: input.body },
            toRecipients: [
              { emailAddress: { address: to } },
            ],
          }),
        });
        return {
          id: patched.id || draft.id,
          subject: patched.subject || input.subject,
          webLink: patched.webLink || draft.webLink || null,
        };
      }
    } catch {
      // Fallback: freier Entwurf
    }
  }

  const created = await graphJson<{
    id?: string;
    subject?: string;
    webLink?: string | null;
  }>(userId, "/me/messages", {
    method: "POST",
    body: JSON.stringify({
      subject: input.subject,
      body: { contentType: "Text", content: input.body },
      toRecipients: [{ emailAddress: { address: to } }],
    }),
  });
  if (!created.id) throw new Error("Outlook-Entwurf ohne ID.");
  return {
    id: created.id,
    subject: created.subject || input.subject,
    webLink: created.webLink || null,
  };
}
