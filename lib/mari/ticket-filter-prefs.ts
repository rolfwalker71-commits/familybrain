import { getSetting, setSetting } from "@/lib/db/migrations";
import { ALL_STATUS_IDS, WORK_STATUS_IDS } from "@/lib/mari/status";
import { normalizeMariCardCode } from "@/lib/mari/customers";
import {
  DEFAULT_MARI_LIST_META_FIELDS,
  MARI_LIST_META_FIELD_OPTIONS,
  type MariListMetaField,
  type MariListSort,
  type MariTicketFilterCustomer,
  type MariTicketFilterMode,
  type MariTicketFilterPrefs,
  type MariTimelineSort,
} from "@/lib/mari/ticket-filter-prefs-shared";

export type {
  MariListMetaField,
  MariListSort,
  MariTicketFilterCustomer,
  MariTicketFilterMode,
  MariTicketFilterPrefs,
  MariTimelineSort,
} from "@/lib/mari/ticket-filter-prefs-shared";

export {
  DEFAULT_MARI_LIST_META_FIELDS,
  MARI_LIST_META_FIELD_OPTIONS,
} from "@/lib/mari/ticket-filter-prefs-shared";

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

function sanitizeFilterMode(raw: unknown): MariTicketFilterMode | null {
  if (raw === "handler" || raw === "customer") return raw;
  return null;
}

function sanitizeTimelineSort(raw: unknown): MariTimelineSort | null {
  if (raw === "newest" || raw === "oldest") return raw;
  return null;
}

function sanitizeListSort(raw: unknown): MariListSort | null {
  if (raw === "newest" || raw === "oldest") return raw;
  return null;
}

const LIST_META_ALLOWED = new Set<MariListMetaField>(
  MARI_LIST_META_FIELD_OPTIONS.map((o) => o.id)
);

function sanitizeListMetaFields(raw: unknown): MariListMetaField[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MariListMetaField[] = [];
  const seen = new Set<MariListMetaField>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v as MariListMetaField;
    if (!LIST_META_ALLOWED.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sanitizeCustomers(raw: unknown): MariTicketFilterCustomer[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MariTicketFilterCustomer[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as { cardCode?: unknown; name?: unknown };
    const cardCode = normalizeMariCardCode(
      typeof o.cardCode === "string" ? o.cardCode : null
    );
    if (!cardCode || seen.has(cardCode)) continue;
    seen.add(cardCode);
    const name =
      typeof o.name === "string" && o.name.trim()
        ? o.name.trim().slice(0, 120)
        : cardCode;
    out.push({ cardCode, name });
    if (out.length >= 40) break;
  }
  return out;
}

export function defaultMariTicketFilterPrefs(): MariTicketFilterPrefs {
  return {
    statuses: [...WORK_STATUS_IDS],
    overdueOnly: false,
    filterMode: "handler",
    customers: [],
    /** Matches previous Maringo order (CreateDate ascending). */
    timelineSort: "oldest",
    /** Neueste Tickets oben — typisch für Support-Inbox. */
    listSort: "newest",
    listMetaFields: [...DEFAULT_MARI_LIST_META_FIELDS],
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
      filterMode?: unknown;
      customers?: unknown;
      cardCodes?: unknown;
      timelineSort?: unknown;
      listSort?: unknown;
      listMetaFields?: unknown;
    };
    const statuses = sanitizeStatuses(parsed.statuses) || defaults.statuses;
    let customers = sanitizeCustomers(parsed.customers);
    if (customers == null && Array.isArray(parsed.cardCodes)) {
      customers = sanitizeCustomers(
        parsed.cardCodes.map((c) =>
          typeof c === "string" ? { cardCode: c, name: c } : c
        )
      );
    }
    return {
      statuses,
      overdueOnly: Boolean(parsed.overdueOnly),
      filterMode: sanitizeFilterMode(parsed.filterMode) || defaults.filterMode,
      customers: customers ?? defaults.customers,
      timelineSort:
        sanitizeTimelineSort(parsed.timelineSort) || defaults.timelineSort,
      listSort: sanitizeListSort(parsed.listSort) || defaults.listSort,
      listMetaFields:
        sanitizeListMetaFields(parsed.listMetaFields) ??
        defaults.listMetaFields,
    };
  } catch {
    return defaults;
  }
}

export function saveMariTicketFilterPrefs(
  ownerKey: string,
  input: {
    statuses?: unknown;
    overdueOnly?: unknown;
    filterMode?: unknown;
    customers?: unknown;
    timelineSort?: unknown;
    listSort?: unknown;
    listMetaFields?: unknown;
  }
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
  const filterMode =
    input.filterMode !== undefined
      ? sanitizeFilterMode(input.filterMode) || current.filterMode
      : current.filterMode;
  const customers =
    input.customers !== undefined
      ? sanitizeCustomers(input.customers) ?? current.customers
      : current.customers;
  const timelineSort =
    input.timelineSort !== undefined
      ? sanitizeTimelineSort(input.timelineSort) || current.timelineSort
      : current.timelineSort;
  const listSort =
    input.listSort !== undefined
      ? sanitizeListSort(input.listSort) || current.listSort
      : current.listSort;
  const listMetaFields =
    input.listMetaFields !== undefined
      ? sanitizeListMetaFields(input.listMetaFields) ?? current.listMetaFields
      : current.listMetaFields;
  const next: MariTicketFilterPrefs = {
    statuses,
    overdueOnly,
    filterMode,
    customers,
    timelineSort,
    listSort,
    listMetaFields,
  };
  setSetting(settingKey(ownerKey), JSON.stringify(next));
  return next;
}
