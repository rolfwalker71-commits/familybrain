import webpush from "web-push";

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    "mailto:buddy@localhost";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(): boolean {
  return getVapidConfig() != null;
}

let configured = false;

export function ensureWebPushConfigured(): VapidConfig | null {
  const cfg = getVapidConfig();
  if (!cfg) return null;
  if (!configured) {
    webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
    configured = true;
  }
  return cfg;
}
