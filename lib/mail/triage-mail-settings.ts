import { getSetting, setSetting } from "@/lib/db/migrations";

export const TRIAGE_MAIL_ENABLED_SETTING = "triage_mail_enabled";
export const TRIAGE_MAIL_RECIPIENTS_SETTING = "triage_mail_recipients";

/** Parse comma/semicolon/newline-separated addresses. */
export function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const email = part.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export function isTriageMailEnabled(): boolean {
  const raw = getSetting(TRIAGE_MAIL_ENABLED_SETTING)?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

export function getTriageMailRecipientsRaw(): string {
  return getSetting(TRIAGE_MAIL_RECIPIENTS_SETTING)?.trim() || "";
}

export function getTriageMailRecipients(): string[] {
  return parseEmailList(getTriageMailRecipientsRaw());
}

export function saveTriageMailSettings(input: {
  enabled?: boolean;
  recipients?: string | null;
}) {
  if (input.enabled !== undefined) {
    setSetting(TRIAGE_MAIL_ENABLED_SETTING, input.enabled ? "1" : "0");
  }
  if (input.recipients !== undefined) {
    const list = parseEmailList(input.recipients);
    setSetting(
      TRIAGE_MAIL_RECIPIENTS_SETTING,
      list.length > 0 ? list.join(", ") : null
    );
  }
}

export function getTriageMailSettingsPublic() {
  return {
    triageMailEnabled: isTriageMailEnabled(),
    triageMailRecipients: getTriageMailRecipientsRaw(),
  };
}
