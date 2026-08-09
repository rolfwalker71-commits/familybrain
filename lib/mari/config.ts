import { resolveMariConfig } from "@/lib/mari/settings";

export type MariConfig = {
  baseUrl: string;
  username: string;
  password: string;
  employeeNumber: string;
};

/** Prefer Einstellungen (SQLite), then .env. */
export function getMariConfig(): MariConfig | null {
  return resolveMariConfig();
}

export function hasMariConfig(): boolean {
  return getMariConfig() != null;
}
