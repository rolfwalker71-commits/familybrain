import { getSetting, setSetting } from "@/lib/db/migrations";
import { maskToken } from "@/lib/utils/format";
import type { MariConfig } from "@/lib/mari/config";

const KEY_BASE = "mari_rest_base_url";
const KEY_USER = "mari_rest_username";
const KEY_PASS = "mari_rest_password";
const KEY_EMP = "mari_employee_number";

const DEFAULT_BASE = "https://marirestservice.an-group.international";

function envOrNull(key: string): string | null {
  const v = process.env[key]?.trim();
  return v || null;
}

/** Stored settings + env fallback (settings win when set). */
export function resolveMariConfig(): MariConfig | null {
  const baseUrl = (
    getSetting(KEY_BASE) ||
    envOrNull("MARI_REST_BASE_URL") ||
    DEFAULT_BASE
  ).replace(/\/$/, "");
  const username =
    getSetting(KEY_USER) || envOrNull("MARI_REST_USERNAME") || "";
  const password =
    getSetting(KEY_PASS) || envOrNull("MARI_REST_PASSWORD") || "";
  const employeeNumber =
    getSetting(KEY_EMP) || envOrNull("MARI_EMPLOYEE_NUMBER") || "";
  if (!baseUrl || !username || !password || !employeeNumber) return null;
  return { baseUrl, username, password, employeeNumber };
}

export function getMariSettingsPublic() {
  const storedUser = getSetting(KEY_USER);
  const storedPass = getSetting(KEY_PASS);
  const storedBase = getSetting(KEY_BASE);
  const storedEmp = getSetting(KEY_EMP);
  const resolved = resolveMariConfig();
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
