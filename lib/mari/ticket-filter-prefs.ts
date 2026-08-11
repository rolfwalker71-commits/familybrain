import { getSetting, setSetting } from "@/lib/db/migrations";
import { ALL_STATUS_IDS, WORK_STATUS_IDS } from "@/lib/mari/status";

export type MariTicketFilterPrefs = {
  statuses: number[];
  overdueOnly: boolean;
};

const KEY_PREFIX = "mari_ticket_filter_prefs:";

function settingKey(ownerKey: string): string {
  return `${KEY_PREFIX}${ownerKey}`;
}

function sanitizeStatuses(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const allowed = new Set<number>(ALL_STATUS_IDS);
  const out = [
    ...new Set(
      raw
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && allowed.has(n))
    ),
  ].sort((a, b) => a - b);
  return out.length > 0 ? out : null;
}

export function defaultMariTicketFilterPrefs(): MariTicketFilterPrefs {
  return {
    statuses: [...WORK_STATUS_IDS],
    overdueOnly: false,
  };
}

export function getMariTicketFilterPrefs(
  ownerKey: string
): MariTicketFilterPrefs {
  const defaults = defaultMariTicketFilterPrefs();
  const raw = getSetting(settingKey(ownerKey));
  if (!raw?.trim()) return defaults;
  try {
    const parsed = JSON.parse(raw) as {
      statuses?: unknown;
      overdueOnly?: unknown;
    };
    const statuses = sanitizeStatuses(parsed.statuses) || defaults.statuses;
    return {
      statuses,
      overdueOnly: Boolean(parsed.overdueOnly),
    };
  } catch {
    return defaults;
  }
}

export function saveMariTicketFilterPrefs(
  ownerKey: string,
  input: { statuses?: unknown; overdueOnly?: unknown }
): MariTicketFilterPrefs {
  const current = getMariTicketFilterPrefs(ownerKey);
  const statuses =
    input.statuses !== undefined
      ? sanitizeStatuses(input.statuses) || current.statuses
      : current.statuses;
  const overdueOnly =
    input.overdueOnly !== undefined
      ? Boolean(input.overdueOnly)
      : current.overdueOnly;
  const next: MariTicketFilterPrefs = { statuses, overdueOnly };
  setSetting(settingKey(ownerKey), JSON.stringify(next));
  return next;
}
