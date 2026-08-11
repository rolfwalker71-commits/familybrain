import { google } from "googleapis";
import {
  getAuthedGoogleClient,
  hasGoogleCalendarEventsWriteScope,
} from "@/lib/google/oauth";

export type CreateGoogleEventInput = {
  calendarId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** YYYY-MM-DD */
  startDate: string;
  /** HH:mm or null for all-day */
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  /** Private extended properties (Buddy stamps). */
  privateProps?: Record<string, string> | null;
};

export type CreatedGoogleEvent = {
  id: string;
  calendarId: string;
  htmlLink: string | null;
  summary: string;
};

function addOneDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Create a timed or all-day event (Europe/Zurich). */
export async function createGoogleCalendarEvent(
  userId: number,
  input: CreateGoogleEventInput,
  request?: Request | null
): Promise<CreatedGoogleEvent> {
  if (!hasGoogleCalendarEventsWriteScope(userId)) {
    throw new Error(
      "Kalender-Schreibrecht fehlt — bitte unter Konto neu verbinden."
    );
  }
  const calendarId = input.calendarId.trim();
  if (!calendarId) throw new Error("Kalender fehlt.");
  const title = input.title.trim();
  if (!title) throw new Error("Titel fehlt.");

  const allDay =
    input.allDay === true || !input.startTime || !String(input.startTime).trim();
  const startDate = input.startDate.slice(0, 10);
  const endDate = (input.endDate || startDate).slice(0, 10);

  const auth = await getAuthedGoogleClient(userId, request);
  const calendar = google.calendar({ version: "v3", auth });

  const privateProps = input.privateProps
    ? Object.fromEntries(
        Object.entries(input.privateProps).filter(
          ([, v]) => typeof v === "string" && v.trim()
        )
      )
    : null;

  const requestBody: Record<string, unknown> = allDay
    ? {
        summary: title,
        description: input.description?.trim() || undefined,
        location: input.location?.trim() || undefined,
        start: { date: startDate },
        end: { date: addOneDay(endDate) },
      }
    : {
        summary: title,
        description: input.description?.trim() || undefined,
        location: input.location?.trim() || undefined,
        start: {
          dateTime: `${startDate}T${input.startTime}:00`,
          timeZone: "Europe/Zurich",
        },
        end: {
          dateTime: `${endDate}T${(input.endTime || input.startTime)!.slice(0, 5)}:00`,
          timeZone: "Europe/Zurich",
        },
      };

  if (privateProps && Object.keys(privateProps).length) {
    requestBody.extendedProperties = { private: privateProps };
  }

  // If timed and end <= start, bump end by 1 hour via dateTime on same day + 1h
  if (!allDay && input.startTime) {
    const startHm = input.startTime.slice(0, 5);
    const endHm = (input.endTime || "").slice(0, 5);
    if (!endHm || endHm <= startHm) {
      const [h, m] = startHm.split(":").map(Number);
      const endMinutes = (h || 0) * 60 + (m || 0) + 60;
      const eh = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
      const em = String(endMinutes % 60).padStart(2, "0");
      (requestBody as { end: { dateTime: string; timeZone: string } }).end = {
        dateTime: `${endDate}T${eh}:${em}:00`,
        timeZone: "Europe/Zurich",
      };
    }
  }

  const res = await calendar.events.insert({
    calendarId,
    requestBody,
  });
  const id = res.data.id;
  if (!id) throw new Error("Termin konnte nicht angelegt werden.");
  return {
    id,
    calendarId,
    htmlLink: res.data.htmlLink || null,
    summary: res.data.summary || title,
  };
}

/** Patch an existing timed or all-day event (Europe/Zurich). */
export async function updateGoogleCalendarEvent(
  userId: number,
  input: CreateGoogleEventInput & { eventId: string },
  request?: Request | null
): Promise<CreatedGoogleEvent> {
  if (!hasGoogleCalendarEventsWriteScope(userId)) {
    throw new Error(
      "Kalender-Schreibrecht fehlt — bitte unter Konto neu verbinden."
    );
  }
  const calendarId = input.calendarId.trim();
  const eventId = input.eventId.trim();
  if (!calendarId || !eventId) throw new Error("Kalender oder Event-ID fehlt.");
  const title = input.title.trim();
  if (!title) throw new Error("Titel fehlt.");

  const allDay =
    input.allDay === true || !input.startTime || !String(input.startTime).trim();
  const startDate = input.startDate.slice(0, 10);
  const endDate = (input.endDate || startDate).slice(0, 10);

  const auth = await getAuthedGoogleClient(userId, request);
  const calendar = google.calendar({ version: "v3", auth });

  const requestBody = allDay
    ? {
        summary: title,
        description: input.description?.trim() || undefined,
        location: input.location?.trim() || undefined,
        start: { date: startDate },
        end: { date: addOneDay(endDate) },
      }
    : {
        summary: title,
        description: input.description?.trim() || undefined,
        location: input.location?.trim() || undefined,
        start: {
          dateTime: `${startDate}T${input.startTime}:00`,
          timeZone: "Europe/Zurich",
        },
        end: {
          dateTime: `${endDate}T${(input.endTime || input.startTime)!.slice(0, 5)}:00`,
          timeZone: "Europe/Zurich",
        },
      };

  if (!allDay && input.startTime) {
    const startHm = input.startTime.slice(0, 5);
    const endHm = (input.endTime || "").slice(0, 5);
    if (!endHm || endHm <= startHm) {
      const [h, m] = startHm.split(":").map(Number);
      const endMinutes = (h || 0) * 60 + (m || 0) + 60;
      const eh = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
      const em = String(endMinutes % 60).padStart(2, "0");
      (requestBody as { end: { dateTime: string; timeZone: string } }).end = {
        dateTime: `${endDate}T${eh}:${em}:00`,
        timeZone: "Europe/Zurich",
      };
    }
  }

  const res = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody,
  });
  const id = res.data.id || eventId;
  return {
    id,
    calendarId,
    htmlLink: res.data.htmlLink || null,
    summary: res.data.summary || title,
  };
}
