import { getSetting, setSetting } from "@/lib/db/migrations";
import { getSmtpFrom, getSmtpUser } from "@/lib/finance-brain/mail-settings";

export const TRIAGE_MAIL_ENABLED_SETTING = "triage_mail_enabled";
export const TRIAGE_MAIL_RECIPIENTS_SETTING = "triage_mail_recipients";
export const TRIAGE_MAIL_FROM_SETTING = "triage_mail_from";

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

export function getTriageMailFromRaw(): string {
  return getSetting(TRIAGE_MAIL_FROM_SETTING)?.trim() || "";
}

/** Extract bare email from «Name <a@b.ch>» or plain address. */
export function extractEmailAddress(raw: string | null | undefined): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const angled = /<([^<>\s]+@[^<>\s]+)>/.exec(t);
  if (angled?.[1]) return angled[1].trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return t;
  return null;
}

/**
 * From header for triage mails — separate from TripBook/SMTP default.
 * Accepts «Buddy», «Buddy <mail@…>», or bare address. Falls back to Buddy <smtpUser>.
 */
export function getTriageMailFrom(): string {
  const configured = getTriageMailFromRaw();
  const smtpEmail =
    extractEmailAddress(getSmtpFrom()) || getSmtpUser()?.trim() || null;

  if (configured) {
    if (/<[^>]+@[^>]+>/.test(configured)) return configured;
    const asEmail = extractEmailAddress(configured);
    if (asEmail) return `Buddy <${asEmail}>`;
    // Display name only
    if (smtpEmail) return `${configured} <${smtpEmail}>`;
    return configured;
  }

  if (smtpEmail) return `Buddy <${smtpEmail}>`;
  return getSmtpFrom() || "";
}

export function saveTriageMailSettings(input: {
  enabled?: boolean;
  recipients?: string | null;
  from?: string | null;
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
  if (input.from !== undefined) {
    setSetting(TRIAGE_MAIL_FROM_SETTING, input.from?.trim() || null);
  }
}

export function getTriageMailSettingsPublic() {
  return {
    triageMailEnabled: isTriageMailEnabled(),
    triageMailRecipients: getTriageMailRecipientsRaw(),
    triageMailFrom: getTriageMailFromRaw(),
    triageMailFromEffective: getTriageMailFrom(),
  };
}
