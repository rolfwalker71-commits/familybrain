import { getDb } from "@/lib/db/client";
import {
  aircraftPublicUrl,
  eventAiImagePublicUrl,
  mapPublicUrl,
} from "@/lib/trips/cover";
import {
  listLinkedDocumentIdsForEvents,
  type TripEventRow,
} from "@/lib/trips/queries";

export type TripEventDocumentRef = {
  id: number;
  paperless_id: number;
  title: string | null;
  /** Can be unlinked from the event (junction / primary). */
  removable: boolean;
};

export type SerializedTripEvent = TripEventRow & {
  aircraft_image_url: string | null;
  map_image_url: string | null;
  ai_image_url: string | null;
  documents: TripEventDocumentRef[];
};

function collectDocumentIds(
  event: TripEventRow,
  linkedIds: number[]
): { ids: number[]; removable: Set<number> } {
  const ids = new Set<number>();
  const removable = new Set<number>();

  for (const id of linkedIds) {
    if (id > 0) {
      ids.add(id);
      removable.add(id);
    }
  }

  if (event.document_id != null && event.document_id > 0) {
    ids.add(event.document_id);
    removable.add(event.document_id);
  }

  if (event.travel_item_id != null && event.travel_item_id > 0) {
    const db = getDb();
    const row = db
      .prepare(`SELECT document_id FROM travel_items WHERE id = ?`)
      .get(event.travel_item_id) as { document_id: number } | undefined;
    if (row?.document_id) ids.add(row.document_id);
  }

  return { ids: [...ids], removable };
}

function loadDocumentRefs(
  ids: number[],
  removable: Set<number>
): TripEventDocumentRef[] {
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
      removable: removable.has(r.id),
    }));
}

export function serializeTripEvent(event: TripEventRow): SerializedTripEvent {
  const linked = listLinkedDocumentIdsForEvents([event.id]).get(event.id) || [];
  const { ids, removable } = collectDocumentIds(event, linked);
  return {
    ...event,
    aircraft_image_url: aircraftPublicUrl(event.aircraft_image_path),
    map_image_url: mapPublicUrl(event.map_image_path),
    ai_image_url: eventAiImagePublicUrl(event.ai_image_path),
    documents: loadDocumentRefs(ids, removable),
  };
}

export function serializeTripEvents(
  events: TripEventRow[]
): SerializedTripEvent[] {
  if (events.length === 0) return [];

  const linkedByEvent = listLinkedDocumentIdsForEvents(events.map((e) => e.id));
  const allIds = new Set<number>();
  const perEvent = events.map((event) => {
    const linked = linkedByEvent.get(event.id) || [];
    const collected = collectDocumentIds(event, linked);
    collected.ids.forEach((id) => allIds.add(id));
    return collected;
  });

  const unionRemovable = new Set<number>();
  perEvent.forEach((p) => p.removable.forEach((id) => unionRemovable.add(id)));
  // load with per-event removable below
  const refsAll = loadDocumentRefs([...allIds], unionRemovable);
  const byId = new Map(refsAll.map((r) => [r.id, r]));

  return events.map((event, i) => {
    const { ids, removable } = perEvent[i];
    return {
      ...event,
      aircraft_image_url: aircraftPublicUrl(event.aircraft_image_path),
      map_image_url: mapPublicUrl(event.map_image_path),
      ai_image_url: eventAiImagePublicUrl(event.ai_image_path),
      documents: ids
        .map((id) => {
          const ref = byId.get(id);
          if (!ref) return null;
          return { ...ref, removable: removable.has(id) };
        })
        .filter((r): r is TripEventDocumentRef => Boolean(r)),
    };
  });
}
