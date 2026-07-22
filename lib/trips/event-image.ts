import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/client";
import { buildEventImagePrompt } from "@/lib/trips/event-image-prompt";
import { getEventAiImagePromptTemplate } from "@/lib/trips/event-image-settings";
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
  const prompt =
    userPrompt?.trim() ||
    buildEventImagePrompt(event, getEventAiImagePromptTemplate());

  const client = getOpenAIClient();
  // gpt-image-2: better readable text; low+square keeps cost down vs trip cover.
  const result = await client.images.generate({
    model: "gpt-image-2",
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

export async function saveEventAiImageUpload(
  eventId: number,
  buffer: Buffer,
  mimeType: string
): Promise<TripEventRow> {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");

  ensureTripMediaDirs();
  const ext =
    mimeType.includes("png")
      ? "png"
      : mimeType.includes("webp")
        ? "webp"
        : "jpg";
  const filename = `event-${eventId}-${randomUUID().slice(0, 8)}.${ext}`;
  const fullPath = path.join(getTripEventAiDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  deleteEventAiImageFile(event.ai_image_path);

  return updateTripEvent(eventId, {
    eventType: event.event_type,
    title: event.title,
    aiImagePath: fullPath,
    // Manual replace: clear AI prompt so regenerate uses settings again.
    aiImagePrompt: null,
  });
}
