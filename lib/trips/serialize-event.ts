import { getDb } from "@/lib/db/client";
import {
  aircraftPublicUrl,
  mapPublicUrl,
} from "@/lib/trips/cover";
import type { TripEventRow } from "@/lib/trips/queries";

export type TripEventDocumentRef = {
  id: number;
  paperless_id: number;
  title: string | null;
};

export type SerializedTripEvent = TripEventRow & {
  aircraft_image_url: string | null;
  map_image_url: string | null;
  documents: TripEventDocumentRef[];
};

function collectDocumentIds(event: TripEventRow): number[] {
  const ids = new Set<number>();
  if (event.document_id != null && event.document_id > 0) {
    ids.add(event.document_id);
  }
  if (event.travel_item_id != null && event.travel_item_id > 0) {
    const db = getDb();
    const row = db
      .prepare(`SELECT document_id FROM travel_items WHERE id = ?`)
      .get(event.travel_item_id) as { document_id: number } | undefined;
    if (row?.document_id) ids.add(row.document_id);
  }
  return [...ids];
}

function loadDocumentRefs(ids: number[]): TripEventDocumentRef[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, paperless_id, title
       FROM paperless_documents
       WHERE id IN (${placeholders})`
    )
    .all(...ids) as Array<{
    id: number;
    paperless_id: number;
    title: string | null;
  }>;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      id: r.id,
      paperless_id: r.paperless_id,
      title: r.title,
    }));
}

export function serializeTripEvent(event: TripEventRow): SerializedTripEvent {
  return {
    ...event,
    aircraft_image_url: aircraftPublicUrl(event.aircraft_image_path),
    map_image_url: mapPublicUrl(event.map_image_path),
    documents: loadDocumentRefs(collectDocumentIds(event)),
  };
}

export function serializeTripEvents(
  events: TripEventRow[]
): SerializedTripEvent[] {
  if (events.length === 0) return [];

  const allIds = new Set<number>();
  const perEventIds = events.map((event) => {
    const ids = collectDocumentIds(event);
    ids.forEach((id) => allIds.add(id));
    return ids;
  });

  const refs = loadDocumentRefs([...allIds]);
  const byId = new Map(refs.map((r) => [r.id, r]));

  return events.map((event, i) => ({
    ...event,
    aircraft_image_url: aircraftPublicUrl(event.aircraft_image_path),
    map_image_url: mapPublicUrl(event.map_image_path),
    documents: perEventIds[i]
      .map((id) => byId.get(id))
      .filter((r): r is TripEventDocumentRef => Boolean(r)),
  }));
}
