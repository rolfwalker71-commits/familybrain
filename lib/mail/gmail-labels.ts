import { google } from "googleapis";
import {
  getAuthedGoogleClient,
  hasGmailModifyScope,
} from "@/lib/google/oauth";
import type { MailAnalysisStatus } from "@/lib/mail/mail-heuristic";

/** Gmail label names matching Buddy analysis chips (flat «BUDDY - …»). */
export const GMAIL_STATUS_LABELS: Record<
  MailAnalysisStatus,
  string
> = {
  pending_triage: "BUDDY - Zur Triage",
  analyzed: "BUDDY - Kein Extrakt",
  skipped: "BUDDY - Übersprungen",
  error: "BUDDY - Fehler",
  applied: "BUDDY - Übernommen",
  dismissed: "BUDDY - Verworfen",
};

const ALL_BUDDY_LABEL_NAMES = Object.values(GMAIL_STATUS_LABELS);

/** Previous nested names — still removed when updating a message. */
const LEGACY_BUDDY_LABEL_NAMES = [
  "Buddy/Zur Triage",
  "Buddy/Kein Extrakt",
  "Buddy/Übersprungen",
  "Buddy/Fehler",
  "Buddy/Übernommen",
  "Buddy/Verworfen",
] as const;

const LABEL_NAMES_TO_TRACK = new Set<string>([
  ...ALL_BUDDY_LABEL_NAMES,
  ...LEGACY_BUDDY_LABEL_NAMES,
]);

/** In-process cache: userId → label name → gmail label id */
const labelIdCache = new Map<number, Map<string, string>>();

function cacheFor(userId: number): Map<string, string> {
  let m = labelIdCache.get(userId);
  if (!m) {
    m = new Map();
    labelIdCache.set(userId, m);
  }
  return m;
}

export function clearGmailLabelCache(userId?: number): void {
  if (userId == null) {
    labelIdCache.clear();
    return;
  }
  labelIdCache.delete(userId);
}

async function ensureLabelId(
  userId: number,
  labelName: string,
  request?: Request | null
): Promise<string | null> {
  const cache = cacheFor(userId);
  const hit = cache.get(labelName);
  if (hit) return hit;

  const auth = await getAuthedGoogleClient(userId, request);
  const gmail = google.gmail({ version: "v1", auth });

  const listed = await gmail.users.labels.list({ userId: "me" });
  for (const lab of listed.data.labels || []) {
    const name = lab.name?.trim();
    const id = lab.id?.trim();
    if (!name || !id) continue;
    if (LABEL_NAMES_TO_TRACK.has(name) || name === labelName) {
      cache.set(name, id);
    }
  }

  const existing = cache.get(labelName);
  if (existing) return existing;

  const created = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  const id = created.data.id?.trim();
  if (!id) return null;
  cache.set(labelName, id);
  return id;
}

/**
 * Set the Buddy status label on a Gmail message (removes other BUDDY - / legacy labels).
 * No-op if gmail.modify scope is missing.
 */
export async function applyGmailStatusLabel(
  userId: number,
  messageId: string,
  status: MailAnalysisStatus,
  request?: Request | null
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  if (!messageId.trim()) {
    return { ok: false, skipped: "messageId fehlt" };
  }
  if (!hasGmailModifyScope(userId)) {
    return { ok: false, skipped: "gmail.modify fehlt — Google neu verbinden" };
  }

  try {
    const targetName = GMAIL_STATUS_LABELS[status];
    const targetId = await ensureLabelId(userId, targetName, request);
    if (!targetId) {
      return { ok: false, error: `Label ${targetName} nicht anlegbar` };
    }

    const cache = cacheFor(userId);
    const removeIds: string[] = [];
    for (const name of LABEL_NAMES_TO_TRACK) {
      if (name === targetName) continue;
      const id = cache.get(name);
      if (id) removeIds.push(id);
    }

    const auth = await getAuthedGoogleClient(userId, request);
    const gmail = google.gmail({ version: "v1", auth });
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: [targetId],
        removeLabelIds: removeIds.length > 0 ? removeIds : undefined,
      },
    });
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[gmail] status label:", msg);
    return { ok: false, error: msg };
  }
}
