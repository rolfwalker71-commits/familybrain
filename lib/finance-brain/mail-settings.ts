import { getSetting, setSetting } from "@/lib/db/migrations";
import { maskToken } from "@/lib/utils/format";

export const SMTP_HOST_SETTING = "smtp_host";
export const SMTP_PORT_SETTING = "smtp_port";
export const SMTP_SECURE_SETTING = "smtp_secure";
export const SMTP_USER_SETTING = "smtp_user";
export const SMTP_PASSWORD_SETTING = "smtp_password";
export const SMTP_FROM_SETTING = "smtp_from";

/** iCloud+ / Apple Mail SMTP defaults. */
export const ICLOUD_SMTP = {
  host: "smtp.mail.me.com",
  port: 587,
  secure: false,
} as const;

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string | null;
  from: string;
};

function envOrSetting(settingKey: string, envKey: string): string | null {
  return (
    getSetting(settingKey)?.trim() ||
    process.env[envKey]?.trim() ||
    null
  );
}

export function getSmtpHost(): string {
  return envOrSetting(SMTP_HOST_SETTING, "SMTP_HOST") || ICLOUD_SMTP.host;
}

export function getSmtpPort(): number {
  const raw =
    envOrSetting(SMTP_PORT_SETTING, "SMTP_PORT") || String(ICLOUD_SMTP.port);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : ICLOUD_SMTP.port;
}

export function getSmtpSecure(): boolean {
  const raw = envOrSetting(SMTP_SECURE_SETTING, "SMTP_SECURE");
  if (raw == null) return ICLOUD_SMTP.secure;
  return raw === "1" || raw.toLowerCase() === "true";
}

export function getSmtpUser(): string | null {
  return envOrSetting(SMTP_USER_SETTING, "SMTP_USER");
}

export function getSmtpPassword(): string | null {
  return envOrSetting(SMTP_PASSWORD_SETTING, "SMTP_PASSWORD");
}

export function getSmtpFrom(): string {
  const configured = envOrSetting(SMTP_FROM_SETTING, "SMTP_FROM");
  if (configured) return configured;
  const user = getSmtpUser();
  return user ? `FamilyBrain <${user}>` : "";
}

export function getSmtpSettings(): SmtpSettings {
  return {
    host: getSmtpHost(),
    port: getSmtpPort(),
    secure: getSmtpSecure(),
    user: getSmtpUser() || "",
    password: getSmtpPassword(),
    from: getSmtpFrom(),
  };
}

export function isEmailConfigured(): boolean {
  const s = getSmtpSettings();
  return Boolean(s.host && s.user && s.password && s.from);
}

export function saveSmtpSettings(input: {
  host?: string | null;
  port?: number | null;
  secure?: boolean | null;
  user?: string | null;
  password?: string | null;
  clearPassword?: boolean;
  from?: string | null;
}) {
  if (input.host !== undefined) {
    setSetting(SMTP_HOST_SETTING, input.host?.trim() || null);
  }
  if (input.port !== undefined) {
    setSetting(
      SMTP_PORT_SETTING,
      input.port != null && input.port > 0 ? String(input.port) : null
    );
  }
  if (input.secure !== undefined) {
    setSetting(
      SMTP_SECURE_SETTING,
      input.secure == null ? null : input.secure ? "1" : "0"
    );
  }
  if (input.user !== undefined) {
    setSetting(SMTP_USER_SETTING, input.user?.trim() || null);
  }
  if (input.clearPassword) {
    setSetting(SMTP_PASSWORD_SETTING, null);
  } else if (input.password !== undefined) {
    const trimmed = input.password?.trim() || null;
    if (trimmed) setSetting(SMTP_PASSWORD_SETTING, trimmed);
  }
  if (input.from !== undefined) {
    setSetting(SMTP_FROM_SETTING, input.from?.trim() || null);
  }
}

export function getSmtpSettingsPublic() {
  const password = getSmtpPassword();
  const settings = getSmtpSettings();
  return {
    smtpHost: settings.host,
    smtpPort: settings.port,
    smtpSecure: settings.secure,
    smtpUser: settings.user,
    smtpPasswordMasked: maskToken(password),
    hasSmtpPassword: Boolean(password),
    smtpFrom: settings.from,
    emailConfigured: isEmailConfigured(),
  };
}
