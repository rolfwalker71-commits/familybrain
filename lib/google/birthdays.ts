import { google } from "googleapis";
import {
  getAuthedGoogleClient,
  isGoogleMailConnected,
} from "@/lib/google/oauth";

export type GoogleBirthdayEvent = {
  id: string;
  date: string;
  summary: string;
  /** Birth year from contact, if known — for age display. */
  birthYear?: number | null;
};

/**
 * Birthdays from Google Calendar (contacts + manually added), expanded
 * to instances in [startIso, endIso] (inclusive YYYY-MM-DD, Zurich range).
 */
export async function listGoogleBirthdaysInRange(
  userId: number,
  startIso: string,
  endIso: string,
  request?: Request | null
): Promise<GoogleBirthdayEvent[]> {
  if (!isGoogleMailConnected(userId)) return [];

  const auth = await getAuthedGoogleClient(userId, request);
  const calendar = google.calendar({ version: "v3", auth });

  const timeMin = `${startIso.slice(0, 10)}T00:00:00Z`;
  const endExclusive = new Date(`${endIso.slice(0, 10)}T12:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const timeMax = `${endExclusive.toISOString().slice(0, 10)}T00:00:00Z`;

  const out: GoogleBirthdayEvent[] = [];
  let pageToken: string | undefined;

  do {
    const res = await calendar.events.list({
      calendarId: "primary",
      eventTypes: ["birthday"],
      singleEvents: true,
      orderBy: "startTime",
      timeMin,
      timeMax,
      timeZone: "Europe/Zurich",
      maxResults: 250,
      pageToken,
    });

    for (const ev of res.data.items || []) {
      const date =
        ev.start?.date?.slice(0, 10) ||
        ev.start?.dateTime?.slice(0, 10) ||
        null;
      if (!date || date < startIso.slice(0, 10) || date > endIso.slice(0, 10)) {
        continue;
      }
      const id = ev.id || `${date}-${ev.summary || "bday"}`;
      const summary = (ev.summary || "Geburtstag").trim();
      out.push({ id, date, summary });
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return out.sort((a, b) => a.date.localeCompare(b.date));
}
