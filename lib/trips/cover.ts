import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/client";
import {
  ensureTripMediaDirs,
  getTripAircraftDir,
  getTripCoversDir,
  getTripEventAiDir,
  getTripMapsDir,
} from "@/lib/trips/paths";
import { updateTrip, getTripById } from "@/lib/trips/queries";

export function coverPublicUrl(coverPath: string | null | undefined): string | null {
  if (!coverPath) return null;
  const base = path.basename(coverPath);
  return `/api/trips/media/cover/${encodeURIComponent(base)}`;
}

export function aircraftPublicUrl(
  filePath: string | null | undefined
): string | null {
  if (!filePath) return null;
  return `/api/trips/media/aircraft/${encodeURIComponent(path.basename(filePath))}`;
}

export function mapPublicUrl(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  return `/api/trips/media/map/${encodeURIComponent(path.basename(filePath))}`;
}

export function eventAiImagePublicUrl(
  filePath: string | null | undefined
): string | null {
  if (!filePath) return null;
  return `/api/trips/media/ai/${encodeURIComponent(path.basename(filePath))}`;
}

export async function saveTripCoverUpload(
  tripId: number,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  ensureTripMediaDirs();
  const trip = getTripById(tripId);
  const previous = trip?.cover_path || null;
  const ext =
    mimeType.includes("png")
      ? "png"
      : mimeType.includes("webp")
        ? "webp"
        : "jpg";
  const filename = `trip-${tripId}-${randomUUID().slice(0, 8)}.${ext}`;
  const fullPath = path.join(getTripCoversDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  updateTrip(tripId, { coverPath: fullPath, coverPrompt: null });
  if (previous && previous !== fullPath && fs.existsSync(previous)) {
    try {
      fs.unlinkSync(previous);
    } catch {
      /* ignore */
    }
  }
  return fullPath;
}

export async function generateTripCover(
  tripId: number,
  title: string,
  destination: string | null,
  userPrompt?: string | null
): Promise<string> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt.");
  }
  ensureTripMediaDirs();
  const prompt =
    userPrompt?.trim() ||
    `Travel destination cover photo, cinematic, no text overlay: ${title}${
      destination ? `, ${destination}` : ""
    }. Photorealistic landscape or city atmosphere suitable as a trip header image.`;

  const client = getOpenAIClient();
  const result = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1536x1024",
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("Bildgenerierung lieferte kein Bild.");
  }
  const buffer = Buffer.from(b64, "base64");
  const filename = `trip-${tripId}-${randomUUID().slice(0, 8)}.png`;
  const fullPath = path.join(getTripCoversDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  const previous = getTripById(tripId)?.cover_path || null;
  updateTrip(tripId, { coverPath: fullPath, coverPrompt: prompt });
  if (previous && previous !== fullPath && fs.existsSync(previous)) {
    try {
      fs.unlinkSync(previous);
    } catch {
      /* ignore */
    }
  }
  return fullPath;
}

export function resolveMediaPath(
  kind: "cover" | "aircraft" | "map" | "ai",
  filename: string
): string | null {
  const safe = path.basename(filename);
  if (!safe || safe.includes("..")) return null;
  const dir =
    kind === "cover"
      ? getTripCoversDir()
      : kind === "aircraft"
        ? getTripAircraftDir()
        : kind === "map"
          ? getTripMapsDir()
          : getTripEventAiDir();
  const full = path.join(dir, safe);
  if (!fs.existsSync(full)) return null;
  return full;
}
