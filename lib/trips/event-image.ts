import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/client";
import { buildEventImagePrompt } from "@/lib/trips/event-image-prompt";
import {
  ensureTripMediaDirs,
  getTripEventAiDir,
} from "@/lib/trips/paths";
import {
  getTripEventById,
  updateTripEvent,
  type TripEventRow,
} from "@/lib/trips/queries";

export function deleteEventAiImageFile(filePath: string | null | undefined) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

export async function generateEventAiImage(
  eventId: number,
  userPrompt?: string | null
): Promise<TripEventRow> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt.");
  }
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");

  ensureTripMediaDirs();
  const prompt = userPrompt?.trim() || buildEventImagePrompt(event);

  const client = getOpenAIClient();
  // Low quality + square is much cheaper than trip-cover (high/landscape).
  const result = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
    quality: "low",
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("Bildgenerierung lieferte kein Bild.");
  }

  const buffer = Buffer.from(b64, "base64");
  const filename = `event-${eventId}-${randomUUID().slice(0, 8)}.png`;
  const fullPath = path.join(getTripEventAiDir(), filename);
  fs.writeFileSync(fullPath, buffer);

  deleteEventAiImageFile(event.ai_image_path);

  return updateTripEvent(eventId, {
    eventType: event.event_type,
    title: event.title,
    aiImagePath: fullPath,
    aiImagePrompt: prompt,
  });
}

export function clearEventAiImage(eventId: number): TripEventRow {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  deleteEventAiImageFile(event.ai_image_path);
  return updateTripEvent(eventId, {
    eventType: event.event_type,
    title: event.title,
    aiImagePath: null,
    aiImagePrompt: null,
  });
}
