import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  DEFAULT_EVENT_AI_IMAGE_PROMPT,
} from "@/lib/trips/event-image-prompt";

export const EVENT_AI_IMAGE_PROMPT_SETTING = "trip_event_ai_image_prompt";
const MAX_PROMPT_LENGTH = 4000;

export function getEventAiImagePromptTemplate(): string {
  const stored = getSetting(EVENT_AI_IMAGE_PROMPT_SETTING);
  if (stored == null || !stored.trim()) {
    return DEFAULT_EVENT_AI_IMAGE_PROMPT;
  }
  return stored.trim();
}

export function isEventAiImagePromptCustomized(): boolean {
  const stored = getSetting(EVENT_AI_IMAGE_PROMPT_SETTING);
  return stored != null && stored.trim().length > 0;
}

export function saveEventAiImagePromptTemplate(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    throw new Error(
      `KI-Bild-Prompt darf höchstens ${MAX_PROMPT_LENGTH} Zeichen haben.`
    );
  }
  if (!trimmed) {
    setSetting(EVENT_AI_IMAGE_PROMPT_SETTING, null);
    return DEFAULT_EVENT_AI_IMAGE_PROMPT;
  }
  setSetting(EVENT_AI_IMAGE_PROMPT_SETTING, trimmed);
  return trimmed;
}

export function resetEventAiImagePromptTemplate(): string {
  setSetting(EVENT_AI_IMAGE_PROMPT_SETTING, null);
  return DEFAULT_EVENT_AI_IMAGE_PROMPT;
}
