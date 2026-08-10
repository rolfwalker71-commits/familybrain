import OpenAI from "openai";
import { getSetting } from "@/lib/db/migrations";

export function getOpenAIApiKey(): string | null {
  return getSetting("openai_api_key") || process.env.OPENAI_API_KEY || null;
}

/** OpenAI-compatible base URL (e.g. DeepSeek). Null = official OpenAI. */
export function getOpenAIBaseUrl(): string | null {
  const fromDb = getSetting("openai_base_url")?.trim().replace(/\/$/, "") || null;
  const fromEnv = process.env.OPENAI_BASE_URL?.trim().replace(/\/$/, "") || null;
  return fromDb || fromEnv || null;
}

export function getOpenAIClient(): OpenAI {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API-Key fehlt. Bitte unter Einstellungen hinterlegen."
    );
  }
  const baseURL = getOpenAIBaseUrl() || undefined;
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    timeout: 120_000,
    maxRetries: 2,
  });
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
