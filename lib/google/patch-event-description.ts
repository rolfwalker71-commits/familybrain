import { google } from "googleapis";
import {
  getAuthedGoogleClient,
  hasGoogleCalendarEventsWriteScope,
} from "@/lib/google/oauth";

/** Patch only the event notes field (description). Title/location untouched. */
export async function patchGoogleEventDescription(
  userId: number,
  input: {
    calendarId: string;
    eventId: string;
    description: string | null;
  },
  request?: Request | null
): Promise<void> {
  if (!hasGoogleCalendarEventsWriteScope(userId)) {
    throw new Error(
      "Kalender-Schreibrecht fehlt — bitte unter Konto neu verbinden."
    );
  }
  const calendarId = input.calendarId.trim();
  const eventId = input.eventId.trim();
  if (!calendarId || !eventId) {
    throw new Error("Kalender oder Event-ID fehlt.");
  }

  const auth = await getAuthedGoogleClient(userId, request);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      description: input.description ?? "",
    },
  });
}
