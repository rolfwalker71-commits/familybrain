import { getSetting, setSetting } from "@/lib/db/migrations";
import { maskToken } from "@/lib/utils/format";

export const RESEND_API_KEY_SETTING = "resend_api_key";
export const RESEND_FROM_SETTING = "resend_from";
export const DEFAULT_RESEND_FROM = "FamilyBrain <noreply@familybrain.local>";

export function getResendApiKey(): string | null {
  return (
    getSetting(RESEND_API_KEY_SETTING)?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    null
  );
}

export function getResendFrom(): string {
  return (
    getSetting(RESEND_FROM_SETTING)?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    DEFAULT_RESEND_FROM
  );
}

export function isEmailConfigured(): boolean {
  return Boolean(getResendApiKey());
}

export function saveResendSettings(input: {
  apiKey?: string | null;
  clearApiKey?: boolean;
  from?: string | null;
}) {
  if (input.clearApiKey) {
    setSetting(RESEND_API_KEY_SETTING, null);
  } else if (input.apiKey !== undefined) {
    const trimmed = input.apiKey?.trim() || null;
    if (trimmed) setSetting(RESEND_API_KEY_SETTING, trimmed);
  }
  if (input.from !== undefined) {
    setSetting(RESEND_FROM_SETTING, input.from?.trim() || null);
  }
}

export function getResendSettingsPublic() {
  const key = getResendApiKey();
  return {
    resendApiKeyMasked: maskToken(key),
    hasResendApiKey: Boolean(key),
    resendFrom: getResendFrom(),
    emailConfigured: Boolean(key),
  };
}
