import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { OJP_API_URL, postOjpXmlRaw } from "@/lib/trips/ojp/client";
import {
  buildOjpLocationRequestXml,
  parseOjpLocationResponse,
} from "@/lib/trips/ojp/location-request";
import { parseOjpTripResponse } from "@/lib/trips/ojp/parse-trip";
import {
  buildOjpTripRequestXml,
  formatOjpDepArrTime,
} from "@/lib/trips/ojp/trip-request";
import { extractOjpErrorMessage } from "@/lib/trips/ojp/xml-utils";
import { getOjpApiToken, hasOjpCredentials } from "@/lib/trips/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  mode: z.enum(["trip", "location"]).default("trip"),
  origin: z.string().min(1).max(120).optional(),
  destination: z.string().min(1).max(120).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  time: z.string().max(16).optional(),
  query: z.string().min(1).max(120).optional(),
});

function normalizeTime(raw: string | undefined): string {
  const value = (raw || "08:00").trim();
  const colon = value.match(/^(\d{1,2}):(\d{2})/);
  if (colon) return `${colon[1].padStart(2, "0")}:${colon[2]}`;
  const spaced = value.match(/^(\d{1,2})\s+(\d{2})$/);
  if (spaced) return `${spaced[1].padStart(2, "0")}:${spaced[2]}`;
  return "08:00";
}

function scoreStop(query: string, name: string): number {
  const q = query.trim().toLowerCase();
  const n = name.toLowerCase();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 60;
  return 10;
}

async function resolveStopRef(query: string) {
  const requestXml = buildOjpLocationRequestXml(query);
  const raw = await postOjpXmlRaw(requestXml);
  if (!raw.ok) {
    throw new Error(
      `Bahnhofssuche für «${query}» fehlgeschlagen (HTTP ${raw.status}).`
    );
  }
  const candidates = parseOjpLocationResponse(raw.body);
  if (candidates.length === 0) {
    throw new Error(`Kein Bahnhof gefunden für «${query}».`);
  }
  const best = [...candidates].sort(
    (a, b) => scoreStop(query, b.name) - scoreStop(query, a.name)
  )[0];
  return { best, candidates, raw };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    if (!hasOjpCredentials() || !getOjpApiToken()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Kein ÖV-CH Token hinterlegt. Bitte zuerst unter TravelBuddy speichern.",
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Ungültige Test-Eingabe." },
        { status: 400 }
      );
    }

    if (parsed.data.mode === "location") {
      const query = parsed.data.query?.trim();
      if (!query) {
        return NextResponse.json(
          { ok: false, error: "Suchbegriff für Bahnhofssuche fehlt." },
          { status: 400 }
        );
      }
      const requestXml = buildOjpLocationRequestXml(query);
      const raw = await postOjpXmlRaw(requestXml);
      const candidates = raw.ok ? parseOjpLocationResponse(raw.body) : [];
      return NextResponse.json({
        ok: raw.ok && candidates.length > 0,
        endpoint: OJP_API_URL,
        mode: "location",
        request: {
          method: "POST",
          query,
          xmlPreview: requestXml.slice(0, 2000),
        },
        response: {
          status: raw.status,
          statusText: raw.statusText,
          elapsedMs: raw.elapsedMs,
          bodyLength: raw.body.length,
          bodyEmpty: !raw.body.trim(),
          errorText: extractOjpErrorMessage(raw.body),
          candidates,
          rawPreview: raw.body.slice(0, 2500),
        },
        hint: !raw.ok
          ? "HTTP-Fehler — Token und OJP-2.0-Zugriff im API Manager prüfen."
          : candidates.length === 0
            ? "Antwort ok, aber keine Haltestellen geparst — XML prüfen."
            : null,
      });
    }

    const origin = parsed.data.origin?.trim();
    const destination = parsed.data.destination?.trim();
    const date = parsed.data.date;
    if (!origin || !destination || !date) {
      return NextResponse.json(
        {
          ok: false,
          error: "Von, Nach und Datum (JJJJ-MM-TT) sind erforderlich.",
        },
        { status: 400 }
      );
    }

    const depArrTimeIso = formatOjpDepArrTime(
      date,
      normalizeTime(parsed.data.time)
    );

    // Resolve names → StopPlaceRef first (Name-only trip requests often fail).
    const [originResolved, destinationResolved] = await Promise.all([
      resolveStopRef(origin),
      resolveStopRef(destination),
    ]);

    const requestXml = buildOjpTripRequestXml({
      origin: {
        stopRef: originResolved.best.stopRef,
        name: originResolved.best.name,
        lat: originResolved.best.lat,
        lon: originResolved.best.lon,
      },
      destination: {
        stopRef: destinationResolved.best.stopRef,
        name: destinationResolved.best.name,
        lat: destinationResolved.best.lat,
        lon: destinationResolved.best.lon,
      },
      depArrTimeIso,
      numberOfResults: 5,
    });
    const raw = await postOjpXmlRaw(requestXml);
    const trips = raw.ok ? parseOjpTripResponse(raw.body) : [];
    const options = trips.map((trip) => ({
      id: trip.id,
      startTime: trip.startTime,
      endTime: trip.endTime,
      durationSeconds: trip.durationSeconds,
      legs: trip.legs.map((leg) => ({
        mode: leg.mode,
        trainNumber: leg.trainNumber,
        from: leg.board.name,
        to: leg.alight.name,
        pathPoints: leg.path.length,
      })),
      pathPoints: trip.path.length,
    }));

    const unavailable =
      !raw.ok &&
      (/service unavailable/i.test(raw.body) || raw.status >= 500);

    return NextResponse.json({
      ok: raw.ok && options.length > 0,
      endpoint: OJP_API_URL,
      mode: "trip",
      request: {
        method: "POST",
        origin,
        destination,
        resolvedOrigin: originResolved.best,
        resolvedDestination: destinationResolved.best,
        date,
        time: normalizeTime(parsed.data.time),
        depArrTimeIso,
        xmlPreview: requestXml.slice(0, 2000),
      },
      response: {
        status: raw.status,
        statusText: raw.statusText,
        elapsedMs: raw.elapsedMs,
        bodyLength: raw.body.length,
        bodyEmpty: !raw.body.trim(),
        errorText: extractOjpErrorMessage(raw.body),
        tripCount: options.length,
        options,
        rawPreview: raw.body.slice(0, 2500),
      },
      hint: unavailable
        ? "OJP-Server meldet vorübergehend «Service Unavailable» (HTTP 5xx). Später erneut versuchen — Token ist ok, wenn die Bahnhofssuche funktioniert."
        : !raw.ok
          ? "HTTP-Fehler — Token und Plan «OJP 2.0» im API Manager prüfen."
          : options.length === 0
            ? "Antwort ok, aber keine Verbindungen geparst — XML / Haltestellennamen prüfen."
            : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
