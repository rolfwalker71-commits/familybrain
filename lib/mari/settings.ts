import { getSetting, setSetting } from "@/lib/db/migrations";
import { maskToken } from "@/lib/utils/format";
import type { MariConfig } from "@/lib/mari/config";
import { getMariRequestUserId } from "@/lib/mari/request-context";
import { getAppUserById } from "@/lib/users/queries";

const KEY_BASE = "mari_rest_base_url";
const KEY_USER = "mari_rest_username";
const KEY_PASS = "mari_rest_password";
const KEY_EMP = "mari_employee_number";

const DEFAULT_BASE = "https://marirestservice.an-group.international";

function envOrNull(key: string): string | null {
  const v = process.env[key]?.trim();
  return v || null;
}

export function getMariBaseUrl(): string {
  return (
    getSetting(KEY_BASE) ||
    envOrNull("MARI_REST_BASE_URL") ||
    DEFAULT_BASE
  ).replace(/\/$/, "");
}

/** Global admin credentials (Einstellungen / env). */
export function resolveGlobalMariConfig(): MariConfig | null {
  const baseUrl = getMariBaseUrl();
  const username =
    getSetting(KEY_USER) || envOrNull("MARI_REST_USERNAME") || "";
  const password =
    getSetting(KEY_PASS) || envOrNull("MARI_REST_PASSWORD") || "";
  const employeeNumber =
    getSetting(KEY_EMP) || envOrNull("MARI_EMPLOYEE_NUMBER") || "";
  if (!baseUrl || !username || !password || !employeeNumber) return null;
  return { baseUrl, username, password, employeeNumber };
}

/**
 * Resolve MARI config for a Buddy user.
 * If the user has a personal MARI login (`mari_rest_username`), that login +
 * password + Personalnummer are used (base URL stays global).
 * Otherwise falls back to global admin credentials.
 */
export function resolveMariConfigForUser(
  userId: number | null | undefined
): MariConfig | null {
  const baseUrl = getMariBaseUrl();
  if (!baseUrl) return null;

  if (userId != null && userId > 0) {
    const user = getAppUserById(userId);
    const personalUser = user?.mari_rest_username?.trim() || "";
    if (personalUser) {
      const password = user?.mari_rest_password?.trim() || "";
      const employeeNumber = user?.mari_employee_number?.trim() || "";
      if (!password || !employeeNumber) return null;
      return {
        baseUrl,
        username: personalUser,
        password,
        employeeNumber,
      };
    }
  }

  return resolveGlobalMariConfig();
}

/** Request-scoped (ALS) or global MARI config. */
export function resolveMariConfig(): MariConfig | null {
  return resolveMariConfigForUser(getMariRequestUserId());
}

export function getMariSettingsPublic() {
  const storedUser = getSetting(KEY_USER);
  const storedPass = getSetting(KEY_PASS);
  const storedBase = getSetting(KEY_BASE);
  const storedEmp = getSetting(KEY_EMP);
  const resolved = resolveGlobalMariConfig();
  return {
    mariBaseUrl: storedBase || envOrNull("MARI_REST_BASE_URL") || DEFAULT_BASE,
    mariUsername: storedUser || envOrNull("MARI_REST_USERNAME") || "",
    mariPasswordMasked: maskToken(storedPass || envOrNull("MARI_REST_PASSWORD")),
    hasMariPassword: Boolean(storedPass || envOrNull("MARI_REST_PASSWORD")),
    mariEmployeeNumber:
      storedEmp || envOrNull("MARI_EMPLOYEE_NUMBER") || "",
    mariConfigured: Boolean(resolved),
    mariFromEnvOnly: Boolean(
      !storedUser && !storedPass && envOrNull("MARI_REST_USERNAME")
    ),
  };
}

export function saveMariSettings(input: {
  baseUrl?: string | null;
  username?: string | null;
  password?: string | null;
  clearPassword?: boolean;
  employeeNumber?: string | null;
}) {
  if (input.baseUrl !== undefined) {
    const normalized = input.baseUrl?.trim().replace(/\/$/, "") || null;
    setSetting(KEY_BASE, normalized);
  }
  if (input.username !== undefined) {
    setSetting(KEY_USER, input.username?.trim() || null);
  }
  if (input.clearPassword) {
    setSetting(KEY_PASS, null);
  } else if (input.password !== undefined && input.password?.trim()) {
    setSetting(KEY_PASS, input.password.trim());
  }
  if (input.employeeNumber !== undefined) {
    const emp = input.employeeNumber?.trim() || null;
    if (emp && !/^[A-Za-z0-9]+$/.test(emp)) {
      throw new Error(
        "Personalnummer darf nur Buchstaben und Ziffern enthalten (z.B. M1010)."
      );
    }
    setSetting(KEY_EMP, emp);
  }
}
