import { getSetting, setSetting } from "@/lib/db/migrations";
import { hasMariConfig, getMariConfig } from "@/lib/mari/config";
import { listMyTickets, type MariTicketListItem } from "@/lib/mari/tickets";
import { ALL_STATUS_IDS, statusChipLabel } from "@/lib/mari/status";
import {
  defaultMariTicketFilterPrefs,
  getMariTicketFilterPrefs,
} from "@/lib/mari/ticket-filter-prefs";
import { notifyAppChange } from "@/lib/realtime/notify";
import { toSwissDate } from "@/lib/utils/dates";

export const MARI_TICKETS_LAST_POLL_KEY = "mari_tickets_last_poll_at";
export const MARI_TICKETS_SNAPSHOT_KEY = "mari_tickets_snapshot_json";
export const MARI_TICKETS_RECENT_CHANGES_KEY =
  "mari_tickets_recent_changes_json";
export const MARI_TICKETS_COUNTS_KEY = "mari_tickets_counts_json";
export const MARI_TICKETS_SYNC_STATUSES_KEY = "mari_tickets_sync_status_ids";
export const MARI_TICKETS_SYNC_INTERVAL_MS = 10 * 60 * 1000;

/** Statuses polled for the home widget snapshot (full filter universe). */
const SYNC_STATUS_IDS = [...ALL_STATUS_IDS];

export type MariTicketSnapshotRow = {
  issueId: number;
  status: number;
  dueDate: string | null;
  changeAtDate: string | null;
  briefDescription: string;
};

export type MariTicketChangeEvent = {
  at: string;
  issueId: number;
  title: string;
  kind: "new" | "status" | "due" | "update";
  detail: string;
};

export type MariTicketCountsByStatus = {
  statusId: number;
  label: string;
  count: number;
};

export type MariTicketsWatchState = {
  configured: boolean;
  employeeNumber: string | null;
  lastPollAt: string | null;
  countsByStatus: MariTicketCountsByStatus[];
  total: number;
  recentChanges: MariTicketChangeEvent[];
};

export type MariTicketsSyncSummary = {
  attempted: boolean;
  reason?: string;
  employeeNumber?: string;
  ticketCount?: number;
  changeCount?: number;
  notified?: boolean;
};

function readJsonSetting<T>(key: string, fallback: T): T {
  const raw = getSetting(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function zurichTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ticketToSnapshot(t: MariTicketListItem): MariTicketSnapshotRow {
  return {
    issueId: t.issueId,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.slice(0, 10) : null,
    changeAtDate: t.changeAtDate || null,
    briefDescription: (t.briefDescription || "").slice(0, 200),
  };
}

function buildCounts(
  tickets: Array<{ status: number }>
): MariTicketCountsByStatus[] {
  const map = new Map<number, number>();
  for (const t of tickets) {
    map.set(t.status, (map.get(t.status) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([statusId, count]) => ({
      statusId,
      label: statusChipLabel(statusId),
      count,
    }));
}

function sameDay(a: string | null, b: string | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

function diffTickets(
  prev: MariTicketSnapshotRow[],
  next: MariTicketSnapshotRow[],
  at: string
): MariTicketChangeEvent[] {
  const prevMap = new Map(prev.map((p) => [p.issueId, p]));
  const changes: MariTicketChangeEvent[] = [];

  for (const n of next) {
    const p = prevMap.get(n.issueId);
    if (!p) {
      changes.push({
        at,
        issueId: n.issueId,
        title: n.briefDescription,
        kind: "new",
        detail: `Neu in der Liste · ${statusChipLabel(n.status)}`,
      });
      continue;
    }
    if (p.status !== n.status) {
      changes.push({
        at,
        issueId: n.issueId,
        title: n.briefDescription,
        kind: "status",
        detail: `Status: ${statusChipLabel(p.status)} → ${statusChipLabel(n.status)}`,
      });
    }
    if (!sameDay(p.dueDate, n.dueDate)) {
      changes.push({
        at,
        issueId: n.issueId,
        title: n.briefDescription,
        kind: "due",
        detail: `Stichtag: ${toSwissDate(p.dueDate)} → ${toSwissDate(n.dueDate)}`,
      });
    } else if (
      p.changeAtDate !== n.changeAtDate &&
      n.changeAtDate &&
      p.status === n.status
    ) {
      changes.push({
        at,
        issueId: n.issueId,
        title: n.briefDescription,
        kind: "update",
        detail: "Aktualisierung / Kommentar",
      });
    }
  }

  return changes;
}

function filterSnapshotForPrefs(
  snapshot: MariTicketSnapshotRow[],
  prefs: { statuses: number[]; overdueOnly: boolean }
): MariTicketSnapshotRow[] {
  const allowed = new Set(prefs.statuses);
  const today = zurichTodayIso();
  return snapshot.filter((row) => {
    if (!allowed.has(row.status)) return false;
    if (prefs.overdueOnly) {
      if (!row.dueDate) return false;
      return row.dueDate < today;
    }
    return true;
  });
}

function syncStatusFingerprint(): string {
  return [...SYNC_STATUS_IDS].sort((a, b) => a - b).join(",");
}

/** True when the persisted poll status set is outdated (e.g. after expanding sync). */
export function mariTicketsSyncNeedsForce(): boolean {
  return getSetting(MARI_TICKETS_SYNC_STATUSES_KEY) !== syncStatusFingerprint();
}

/**
 * Read persisted watch state for overview widget (no MARI call).
 * When `ownerKey` is set, counts/total follow that user's Maringo status filter.
 */
export function getMariTicketsWatchState(
  ownerKey?: string | null
): MariTicketsWatchState {
  const cfg = getMariConfig();
  const prefs = ownerKey
    ? getMariTicketFilterPrefs(ownerKey)
    : defaultMariTicketFilterPrefs();
  const snapshot = readJsonSetting<MariTicketSnapshotRow[]>(
    MARI_TICKETS_SNAPSHOT_KEY,
    []
  );
  const filtered =
    snapshot.length > 0 ? filterSnapshotForPrefs(snapshot, prefs) : null;
  const counts =
    filtered != null
      ? buildCounts(filtered)
      : readJsonSetting<MariTicketCountsByStatus[]>(
          MARI_TICKETS_COUNTS_KEY,
          []
        ).filter((c) => prefs.statuses.includes(c.statusId));
  const recentChanges = readJsonSetting<MariTicketChangeEvent[]>(
    MARI_TICKETS_RECENT_CHANGES_KEY,
    []
  );
  const statusByIssue = new Map(
    (filtered ?? snapshot).map((r) => [r.issueId, r.status])
  );
  const allowed = new Set(prefs.statuses);
  const filteredChanges = recentChanges.filter((ch) => {
    const status = statusByIssue.get(ch.issueId);
    if (status == null) return true;
    return allowed.has(status);
  });
  const lastPollAt = getSetting(MARI_TICKETS_LAST_POLL_KEY);
  const total =
    filtered != null
      ? filtered.length
      : counts.reduce((s, c) => s + c.count, 0);
  return {
    configured: Boolean(cfg),
    employeeNumber: cfg?.employeeNumber ?? null,
    lastPollAt: lastPollAt || null,
    countsByStatus: counts,
    total,
    recentChanges: filteredChanges.slice(0, 12),
  };
}

/**
 * Throttled Maringo ticket poll for configured employee (HandledBy).
 * First run stores baseline only; later runs notify on diffs.
 */
export async function syncMariTicketsIfDue(options?: {
  force?: boolean;
  now?: Date;
}): Promise<MariTicketsSyncSummary> {
  const now = options?.now ?? new Date();
  if (!hasMariConfig()) {
    return { attempted: false, reason: "not-configured" };
  }
  const cfg = getMariConfig()!;
  const employeeNumber = cfg.employeeNumber;

  const desiredStatuses = syncStatusFingerprint();
  const statusSetChanged =
    getSetting(MARI_TICKETS_SYNC_STATUSES_KEY) !== desiredStatuses;
  const force = Boolean(options?.force) || statusSetChanged;

  if (!force) {
    const lastRaw = getSetting(MARI_TICKETS_LAST_POLL_KEY);
    if (lastRaw) {
      const last = new Date(lastRaw).getTime();
      if (
        Number.isFinite(last) &&
        now.getTime() - last < MARI_TICKETS_SYNC_INTERVAL_MS
      ) {
        return { attempted: false, reason: "throttled", employeeNumber };
      }
    }
  }

  const tickets = await listMyTickets({
    employeeNumber,
    statuses: SYNC_STATUS_IDS,
    limit: 200,
  });
  const nextSnap = tickets.map(ticketToSnapshot);
  const counts = buildCounts(tickets);
  const at = now.toISOString();

  const prevSnap = readJsonSetting<MariTicketSnapshotRow[]>(
    MARI_TICKETS_SNAPSHOT_KEY,
    []
  );
  const isBaseline =
    !getSetting(MARI_TICKETS_LAST_POLL_KEY) || statusSetChanged;

  let changes: MariTicketChangeEvent[] = [];
  if (!isBaseline) {
    changes = diffTickets(prevSnap, nextSnap, at);
  }

  const prevRecent = readJsonSetting<MariTicketChangeEvent[]>(
    MARI_TICKETS_RECENT_CHANGES_KEY,
    []
  );
  const recent = [...changes, ...prevRecent].slice(0, 12);

  setSetting(MARI_TICKETS_SNAPSHOT_KEY, JSON.stringify(nextSnap));
  setSetting(MARI_TICKETS_COUNTS_KEY, JSON.stringify(counts));
  setSetting(MARI_TICKETS_RECENT_CHANGES_KEY, JSON.stringify(recent));
  setSetting(MARI_TICKETS_LAST_POLL_KEY, at);
  setSetting(MARI_TICKETS_SYNC_STATUSES_KEY, desiredStatuses);

  let notified = false;
  if (changes.length > 0) {
    const top = changes.slice(0, 3);
    const detailParts = top.map((c) => `#${c.issueId}: ${c.detail}`);
    if (changes.length > 3) {
      detailParts.push(`+${changes.length - 3} weitere`);
    }
    notifyAppChange({
      domain: "documents",
      reason: "mari_ticket_changed",
      headline:
        changes.length === 1
          ? `Maringo #${changes[0]!.issueId} aktualisiert`
          : `Maringo: ${changes.length} Ticket-Updates`,
      detail: detailParts.join(" · "),
      title: top[0]?.title ?? null,
      href: "/maringo",
      aiIconUrl: null,
      category: "Maringo",
      meta: employeeNumber,
      source: "buddy",
    });
    notified = true;
  }

  return {
    attempted: true,
    employeeNumber,
    ticketCount: tickets.length,
    changeCount: changes.length,
    notified,
  };
}
