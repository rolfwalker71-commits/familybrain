import { NextResponse } from "next/server";
import { coverPublicUrl, generateTripCover, saveTripCoverUpload } from "@/lib/trips/cover";
import { getTripById } from "@/lib/trips/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const trip = getTripById(id);
    if (!trip) {
      return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Datei fehlt" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const path = await saveTripCoverUpload(id, buffer, file.type || "image/jpeg");
      const updated = getTripById(id)!;
      return NextResponse.json({
        ok: true,
        trip: { ...updated, cover_url: coverPublicUrl(path) },
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      generate?: boolean;
      prompt?: string;
    };
    if (body.generate) {
      const path = await generateTripCover(
        id,
        trip.title,
        trip.destination,
        body.prompt
      );
      const updated = getTripById(id)!;
      return NextResponse.json({
        ok: true,
        trip: { ...updated, cover_url: coverPublicUrl(path) },
      });
    }

    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
