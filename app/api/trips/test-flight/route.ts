import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAeroDataBoxApiKey,
  getAeroDataBoxBaseUrl,
  getAeroDataBoxHeaders,
  getAeroDataBoxProvider,
} from "@/lib/trips/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  flightNumber: z.string().min(2).max(12),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function normalizeFlightNumber(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Flugnummer und Datum (JJJJ-MM-TT) erforderlich." },
        { status: 400 }
      );
    }

    const apiKey = getAeroDataBoxApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Kein AeroDataBox-Key hinterlegt. Bitte zuerst unter TravelBrain speichern.",
        },
        { status: 400 }
      );
    }

    const provider = getAeroDataBoxProvider();
    const base = getAeroDataBoxBaseUrl(provider);
    const headers = getAeroDataBoxHeaders(apiKey, provider);
    const number = normalizeFlightNumber(parsed.data.flightNumber);
    const date = parsed.data.date;
    const url =
      `${base}/flights/number/${encodeURIComponent(number)}/` +
      `${encodeURIComponent(date)}` +
      `?dateLocalRole=Both&withAircraftImage=true&withLocation=true`;

    const started = Date.now();
    const response = await fetch(url, { headers });
    const elapsedMs = Date.now() - started;
    const text = await response.text().catch(() => "");

    let data: unknown = null;
    let parseError: string | null = null;
    if (text.trim()) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        parseError = "Antwort ist kein gültiges JSON.";
        data = text.slice(0, 4000);
      }
    }

    return NextResponse.json({
      ok: response.ok && response.status !== 204,
      provider,
      request: {
        method: "GET",
        url,
        flightNumber: number,
        date,
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        elapsedMs,
        contentType: response.headers.get("content-type"),
        bodyEmpty: !text.trim(),
        bodyLength: text.length,
        parseError,
        data,
        rawPreview: text.trim() ? text.slice(0, 2000) : null,
      },
      hint:
        response.status === 204
          ? "HTTP 204 = kein Treffer für diese Flugnummer/Datum (nicht zwingend Auth-Fehler)."
          : response.ok
            ? null
            : "Nicht-OK-Status — Key, Subscription und Quota prüfen.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
