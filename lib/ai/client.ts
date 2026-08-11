import OpenAI from "openai";
import { getSetting } from "@/lib/db/migrations";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export type ChatProviderId = "openai" | "deepseek" | "custom";

export function getOpenAIApiKey(): string | null {
  return getSetting("openai_api_key") || process.env.OPENAI_API_KEY || null;
}

/** Official OpenAI only — images, embeddings, vision. Never uses chat base URL. */
export function getOpenAIClient(): OpenAI {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API-Key fehlt. Bitte unter Einstellungen → KI-API hinterlegen (Bilder/Embeddings)."
    );
  }
  return new OpenAI({
    apiKey,
    timeout: 120_000,
    maxRetries: 2,
  });
}

/** OpenAI chat/vision model (e.g. when screenshots need vision). */
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

function normalizeBaseUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim().replace(/\/$/, "") || null;
  return trimmed;
}

function legacyOpenAiBaseUrl(): string | null {
  return normalizeBaseUrl(getSetting("openai_base_url"));
}

export function getChatProvider(): ChatProviderId {
  const raw = (
    getSetting("chat_provider") ||
    process.env.CHAT_PROVIDER ||
    ""
  )
    .trim()
    .toLowerCase();
  if (raw === "openai" || raw === "deepseek" || raw === "custom") {
    return raw;
  }
  const legacy = legacyOpenAiBaseUrl();
  if (legacy?.includes("deepseek.com")) return "deepseek";
  if (legacy) return "custom";
  return "openai";
}

export function getChatBaseUrl(): string | null {
  const provider = getChatProvider();
  if (provider === "openai") return null;
  const stored = normalizeBaseUrl(
    getSetting("chat_base_url") || process.env.CHAT_BASE_URL
  );
  if (provider === "deepseek") {
    return stored || DEEPSEEK_BASE_URL;
  }
  return stored || legacyOpenAiBaseUrl();
}

export function getChatApiKey(): string | null {
  const chatKey =
    getSetting("chat_api_key") || process.env.CHAT_API_KEY || null;
  if (chatKey?.trim()) return chatKey.trim();

  const provider = getChatProvider();
  if (provider === "openai") return getOpenAIApiKey();

  // Legacy: DeepSeek/custom key was stored as openai_api_key with openai_base_url
  if (legacyOpenAiBaseUrl()) return getOpenAIApiKey();

  return null;
}

export function getChatModel(): string {
  const stored =
    getSetting("chat_model") ||
    process.env.CHAT_MODEL ||
    null;
  if (stored?.trim()) return stored.trim();

  if (getChatProvider() === "deepseek") {
    // Prefer explicit chat model; fall back to old openai_model if it looks like DeepSeek
    const legacy = getSetting("openai_model");
    if (legacy?.toLowerCase().includes("deepseek")) return legacy;
    return "deepseek-v4-flash";
  }

  return (
    getSetting("openai_model") ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini"
  );
}

export function getChatClient(): OpenAI {
  const apiKey = getChatApiKey();
  if (!apiKey) {
    throw new Error(
      "Chat-/Analyse-API-Key fehlt. Bitte unter Einstellungen → KI-API hinterlegen."
    );
  }
  const baseURL = getChatBaseUrl() || undefined;
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    timeout: 120_000,
    maxRetries: 2,
  });
}

export function hasChatKey(): boolean {
  return Boolean(getChatApiKey());
}

/**
 * DeepSeek client for mail compose AI — independent of global chat_provider.
 * Prefers chat_api_key; falls back when chat_provider is already deepseek.
 */
export function getDeepSeekMailApiKey(): string | null {
  const chatKey =
    getSetting("chat_api_key") || process.env.CHAT_API_KEY || null;
  if (chatKey?.trim()) return chatKey.trim();
  if (getChatProvider() === "deepseek") return getChatApiKey();
  if (legacyOpenAiBaseUrl()?.includes("deepseek.com")) {
    return getOpenAIApiKey();
  }
  return null;
}

export function hasDeepSeekMailKey(): boolean {
  return Boolean(getDeepSeekMailApiKey());
}

export function getDeepSeekMailModel(): string {
  const explicit =
    getSetting("mail_compose_ai_model") ||
    process.env.MAIL_COMPOSE_AI_MODEL ||
    null;
  if (explicit?.trim()) return explicit.trim();
  if (getChatProvider() === "deepseek") {
    const m = getChatModel();
    if (m.toLowerCase().includes("deepseek")) return m;
  }
  return "deepseek-v4-flash";
}

export function getDeepSeekMailClient(): OpenAI {
  const apiKey = getDeepSeekMailApiKey();
  if (!apiKey) {
    throw new Error(
      "DeepSeek-Key fehlt für Mail-AI. Unter Einstellungen → KI-API den Chat-Key (DeepSeek) hinterlegen."
    );
  }
  const baseURL =
    normalizeBaseUrl(getSetting("chat_base_url") || process.env.CHAT_BASE_URL) ||
    DEEPSEEK_BASE_URL;
  return new OpenAI({
    apiKey,
    baseURL,
    timeout: 120_000,
    maxRetries: 2,
  });
}

/** DeepSeek V4: disable thinking for fast JSON mail drafts. */
export function getDeepSeekMailJsonExtras(): Record<string, unknown> {
  return { thinking: { type: "disabled" } };
}

/**
 * Extra request fields for JSON chat jobs on OpenAI-compatible providers.
 * DeepSeek V4 enables thinking by default — that burns max_tokens, slows
 * multi-batch jobs (Tagesanalyse) a lot, and can leave message.content empty.
 */
export function getChatJsonRequestExtras(): Record<string, unknown> {
  if (getChatProvider() !== "deepseek") return {};
  return { thinking: { type: "disabled" } };
}

/**
 * Text chat/completions (no images) → chat provider.
 * Multimodal / vision → official OpenAI.
 */
export function getAnalysisClient(options?: {
  needsVision?: boolean;
}): { client: OpenAI; model: string; provider: "openai" | "chat" } {
  if (options?.needsVision) {
    return {
      client: getOpenAIClient(),
      model: getOpenAIModel(),
      provider: "openai",
    };
  }
  return {
    client: getChatClient(),
    model: getChatModel(),
    provider: "chat",
  };
}

/** @deprecated Use getChatBaseUrl — kept for older imports. */
export function getOpenAIBaseUrl(): string | null {
  return getChatBaseUrl();
}
