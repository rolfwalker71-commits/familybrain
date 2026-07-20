import { getSetting, setSetting } from "@/lib/db/migrations";

export const CHAT_INSTRUCTIONS_SETTING_KEY = "chat_instructions";

export const DEFAULT_CHAT_INSTRUCTIONS = `Antwortstil (verbindlich):
- Antworte auf Deutsch, knapp und praxisnah.
- Datei- und Verzeichnispfade (Linux und Windows) immer vollständig ausgeben — niemals mit «...» kürzen.
- Befehle, Config-Keys, Hostnamen, Ports, URLs und IDs ebenfalls vollständig und kopierbar halten.
- Code und Pfade in Markdown-Codeblöcken bzw. Inline-Code formatieren.
- Unsicheres oder nicht Belegtes klar als Annahme kennzeichnen; nichts erfinden.
- Listen und Schritte nummerieren, wenn der Nutzer etwas umsetzen soll.`;

const MAX_INSTRUCTIONS_LENGTH = 8000;

/**
 * Active instructions for the chat system prompt.
 * Until the user saves, the built-in template is used — it is fully editable
 * in Settings and becomes the stored version as soon as they save.
 */
export function getChatInstructions(): string {
  const stored = getSetting(CHAT_INSTRUCTIONS_SETTING_KEY);
  if (stored == null || !stored.trim()) {
    return DEFAULT_CHAT_INSTRUCTIONS;
  }
  return stored.trim();
}

export function isChatInstructionsCustomized(): boolean {
  const stored = getSetting(CHAT_INSTRUCTIONS_SETTING_KEY);
  return stored != null && stored.trim().length > 0;
}

export function saveChatInstructions(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length > MAX_INSTRUCTIONS_LENGTH) {
    throw new Error(
      `Chat-Regeln dürfen höchstens ${MAX_INSTRUCTIONS_LENGTH} Zeichen haben.`
    );
  }
  if (!trimmed) {
    setSetting(CHAT_INSTRUCTIONS_SETTING_KEY, null);
    return DEFAULT_CHAT_INSTRUCTIONS;
  }
  setSetting(CHAT_INSTRUCTIONS_SETTING_KEY, trimmed);
  return trimmed;
}

export function resetChatInstructions(): string {
  setSetting(CHAT_INSTRUCTIONS_SETTING_KEY, null);
  return DEFAULT_CHAT_INSTRUCTIONS;
}

export function formatChatInstructionsForPrompt(instructions: string): string {
  const trimmed = instructions.trim();
  if (!trimmed) return "";
  return `Zusätzliche Antwortregeln des Nutzers (verbindlich, haben Vorrang vor Stil-Gewohnheiten des Modells):
${trimmed}`;
}
