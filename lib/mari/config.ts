import { resolveMariConfig } from "@/lib/mari/settings";

export type MariConfig = {
  baseUrl: string;
  username: string;
  password: string;
  employeeNumber: string;
};

/** Prefer per-request user credentials, else Einstellungen / .env. */
export function getMariConfig(): MariConfig | null {
  return resolveMariConfig();
}

export function hasMariConfig(): boolean {
  return getMariConfig() != null;
}
