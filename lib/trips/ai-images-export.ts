import fs from "fs";
import path from "path";
import { buildZipStore, type ZipStoreEntry } from "@/lib/trips/zip-store";
import {
  getTripById,
  listTripEvents,
  type TripEventRow,
  type TripRow,
} from "@/lib/trips/queries";

export function safeDownloadBasename(raw: string, fallback: string): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[^\w\-äöüÄÖÜß.]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 80)
    .replace(/_+$/g, "");
  return cleaned || fallback;
}

export function fileExtension(filePath: string, fallback = ".png"): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return fallback;
}

export function contentTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function padIndex(i: number): string {
  return String(i).padStart(2, "0");
}

export function collectTripAiImageZipEntries(tripId: number): {
  trip: TripRow;
  entries: ZipStoreEntry[];
} {
  const trip = getTripById(tripId);
  if (!trip) throw new Error("Reise nicht gefunden");

  const entries: ZipStoreEntry[] = [];
  let index = 1;

  if (trip.cover_path && fs.existsSync(trip.cover_path)) {
    const ext = fileExtension(trip.cover_path);
    entries.push({
      name: `${padIndex(index)}-titelbild${ext}`,
      data: fs.readFileSync(trip.cover_path),
    });
    index += 1;
  }

  const events = listTripEvents(tripId);
  for (const event of events) {
    if (!event.ai_image_path || !fs.existsSync(event.ai_image_path)) continue;
    const ext = fileExtension(event.ai_image_path);
    const title = safeDownloadBasename(event.title, `event-${event.id}`);
    const type = safeDownloadBasename(event.event_type || "Aktivitaet", "Aktivitaet");
    entries.push({
      name: `${padIndex(index)}-${type}-${title}${ext}`,
      data: fs.readFileSync(event.ai_image_path),
    });
    index += 1;
  }

  return { trip, entries };
}

export function buildTripAiImagesZip(tripId: number): {
  trip: TripRow;
  zip: Buffer;
  count: number;
} {
  const { trip, entries } = collectTripAiImageZipEntries(tripId);
  if (entries.length === 0) {
    throw new Error("Keine KI-Bilder für diese Reise vorhanden.");
  }
  return {
    trip,
    zip: buildZipStore(entries),
    count: entries.length,
  };
}

export function downloadNameForCover(trip: TripRow): string {
  const title = safeDownloadBasename(trip.title, `reise-${trip.id}`);
  const ext = trip.cover_path ? fileExtension(trip.cover_path) : ".png";
  return `${title}-titelbild${ext}`;
}

export function downloadNameForEventAi(event: TripEventRow): string {
  const title = safeDownloadBasename(event.title, `event-${event.id}`);
  const type = safeDownloadBasename(event.event_type || "Aktivitaet", "Aktivitaet");
  const ext = event.ai_image_path
    ? fileExtension(event.ai_image_path)
    : ".png";
  return `${type}-${title}${ext}`;
}
