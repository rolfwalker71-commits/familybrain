import { NextResponse } from "next/server";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import { listDocuments } from "@/lib/db/queries";
import {
  getTripById,
  listTripLinkedDocuments,
} from "@/lib/trips/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Document picker for trip linking.
 * Admins search the full Paperless index; limited users only see docs
 * already linked somewhere on this trip (plus they can upload new PDFs).
 */
export async function GET(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const tripId = Number(idRaw);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const auth = await requireTripAccess(tripId);
    if (isAuthError(auth)) return auth;
    if (!getTripById(tripId)) {
      return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const limit = Number(searchParams.get("limit") || 80);

    if (auth.isAdmin) {
      const data = listDocuments({ search, limit });
      return NextResponse.json({
        documents: data.documents.map((d) => ({
          id: d.id,
          title: d.title,
          original_file_name: d.original_file_name,
          correspondent_name: d.correspondent_name,
          created_date: d.created_date,
        })),
      });
    }

    return NextResponse.json({
      documents: listTripLinkedDocuments(tripId, { search, limit }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
