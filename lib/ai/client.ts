import OpenAI from "openai";
import { getSetting } from "@/lib/db/migrations";

export function getOpenAIApiKey(): string | null {
  return getSetting("openai_api_key") || process.env.OPENAI_API_KEY || null;
}

export function getOpenAIClient(): OpenAI {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API-Key fehlt. Bitte unter Einstellungen hinterlegen."
    );
  }
  return new OpenAI({ apiKey });
}

export function getOpenAIModel(): string {
  return (
    getSetting("openai_model") ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini"
  );
}

export function hasOpenAIKey(): boolean {
  return Boolean(getOpenAIApiKey());
}
