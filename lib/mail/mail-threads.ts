import type { MsMailItem } from "@/lib/microsoft/mail-day";

/** Zurich calendar date YYYY-MM-DD from an ISO timestamp. */
export function zurichYmdFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
    return m?.[1] || null;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function isMailInSelectedRange(
  iso: string | null | undefined,
  fromYmd: string,
  toYmd: string
): boolean {
  const ymd = zurichYmdFromIso(iso);
  if (!ymd) return false;
  return ymd >= fromYmd && ymd <= toYmd;
}

export function annotateMailInRange(
  item: MsMailItem,
  fromYmd: string,
  toYmd: string
): MsMailItem {
  return {
    ...item,
    inRange: isMailInSelectedRange(item.receivedOrSentAt, fromYmd, toYmd),
  };
}

/**
 * Mails die die Tagesanalyse standardmässig überspringt (Noise).
 * Chronik kann sie weiterhin zeigen.
 */
export function isExcludedFromMailAnalysis(mail: {
  subject?: string | null;
}): boolean {
  const subject = mail.subject || "";
  return (
    /\[SYSTEM\s+INFOBOARD\]/i.test(subject) || /\[Monitoring\]/i.test(subject)
  );
}

/** Always date + time (Europe/Zurich), e.g. «10.08.2026 · 12:19». */
export function chronikDateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 16);
  const date = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${date} · ${time}`;
}

export type MailChronikThread = {
  key: string;
  mails: MsMailItem[];
};

/**
 * Group chronik mails into threads. Newest mail first within each thread;
 * threads ordered by their newest mail (newest thread first).
 */
export function buildMailChronikThreads(
  items: MsMailItem[]
): MailChronikThread[] {
  const byKey = new Map<string, MsMailItem[]>();
  const order: string[] = [];

  for (const m of items) {
    const key = m.conversationId?.trim() || `solo:${m.folder}:${m.id}`;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(m);
  }

  const threads: MailChronikThread[] = order.map((key) => {
    const mails = [...(byKey.get(key) || [])].sort((a, b) =>
      (b.receivedOrSentAt || "").localeCompare(a.receivedOrSentAt || "")
    );
    return { key, mails };
  });

  threads.sort((a, b) => {
    const ta = a.mails[0]?.receivedOrSentAt || "";
    const tb = b.mails[0]?.receivedOrSentAt || "";
    return tb.localeCompare(ta);
  });

  return threads;
}

/** Merge by id; prefer existing inRange=true / richer body. */
export function mergeMailItemsById(
  primary: MsMailItem[],
  extra: MsMailItem[]
): MsMailItem[] {
  const map = new Map<string, MsMailItem>();
  for (const m of primary) map.set(m.id, m);
  for (const m of extra) {
    const prev = map.get(m.id);
    if (!prev) {
      map.set(m.id, m);
      continue;
    }
    map.set(m.id, {
      ...prev,
      ...m,
      inRange: Boolean(prev.inRange || m.inRange),
      bodyText:
        (m.bodyText?.length || 0) > (prev.bodyText?.length || 0)
          ? m.bodyText
          : prev.bodyText,
      preview: prev.preview || m.preview,
    });
  }
  return [...map.values()];
}

export function splitMailsByFolder(items: MsMailItem[]): {
  inbox: MsMailItem[];
  sent: MsMailItem[];
} {
  const inbox: MsMailItem[] = [];
  const sent: MsMailItem[] = [];
  for (const m of items) {
    if (m.folder === "sent") sent.push(m);
    else inbox.push(m);
  }
  const byTime = (a: MsMailItem, b: MsMailItem) =>
    (b.receivedOrSentAt || "").localeCompare(a.receivedOrSentAt || "");
  inbox.sort(byTime);
  sent.sort(byTime);
  return { inbox, sent };
}

export type MailThreadCoverage = {
  total: number;
  inRange: number;
  context: number;
  threads: number;
  threadsWithContext: number;
  inboxInRange: number;
  sentInRange: number;
};

/** Stats for Chronik / Tagesanalyse UI + prompts. */
export function summarizeMailThreadCoverage(
  inbox: MsMailItem[],
  sent: MsMailItem[]
): MailThreadCoverage {
  const all = [...inbox, ...sent];
  const inRange = all.filter((m) => m.inRange !== false);
  const context = all.filter((m) => m.inRange === false);
  const threadKeys = new Set(
    all.map((m) => m.conversationId?.trim() || `solo:${m.folder}:${m.id}`)
  );
  const threadsWithContext = new Set(
    context
      .map((m) => m.conversationId?.trim())
      .filter((id): id is string => Boolean(id))
  );
  return {
    total: all.length,
    inRange: inRange.length,
    context: context.length,
    threads: threadKeys.size,
    threadsWithContext: threadsWithContext.size,
    inboxInRange: inbox.filter((m) => m.inRange !== false).length,
    sentInRange: sent.filter((m) => m.inRange !== false).length,
  };
}

export const MAIL_THREAD_EXPAND_MAX_THREADS = 28;
export const MAIL_THREAD_EXPAND_MAX_MESSAGES = 40;
