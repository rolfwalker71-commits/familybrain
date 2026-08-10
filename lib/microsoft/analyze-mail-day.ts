import { getChatClient, getChatJsonRequestExtras, getChatModel, hasChatKey } from "@/lib/ai/client";
import {
  buildAiTokenUsage,
  type AiTokenUsage,
} from "@/lib/ai/usage-cost";
import { emailDomain } from "@/lib/mail/mail-sender-prefs";
import { isExcludedFromMailAnalysis } from "@/lib/mail/mail-threads";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import {
  detectReplyAddressForm,
  detectReplyLanguage,
  normalizeReplySubject,
  replyAddressFormInstruction,
  type ReplyLang,
} from "@/lib/microsoft/reply-language-shared";
import { addDaysYmd } from "@/lib/microsoft/time";
import type OpenAI from "openai";
import { z } from "zod";

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Hm = z.string().regex(/^\d{2}:\d{2}$/);

/** AI often sends null instead of omitting optional/required strings. */
function aiString(max: number) {
  return z.preprocess((v) => {
    if (v == null) return "";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v !== "string") return "";
    return v;
  }, z.string().max(max));
}

function aiStringRequired(max: number, fallback: string) {
  return z.preprocess((v) => {
    if (v == null) return fallback;
    if (typeof v === "number" || typeof v === "boolean") {
      const s = String(v).trim();
      return s || fallback;
    }
    if (typeof v !== "string") return fallback;
    const t = v.trim();
    return t || fallback;
  }, z.string().min(1).max(max));
}

const aiNullableString = (max: number) =>
  z.preprocess((v) => {
    if (v == null || v === "") return null;
    if (typeof v !== "string") return null;
    return v;
  }, z.string().max(max).nullable());

export const MsDayTaskSuggestionSchema = z.object({
  title: aiStringRequired(200, "Aufgabe"),
  notes: aiNullableString(2000).optional(),
  dueDate: Ymd.nullable().optional(),
  sourceMailId: aiNullableString(200).optional(),
  sourceSubject: aiNullableString(300).optional(),
  folder: z.enum(["inbox", "sent"]).nullable().optional(),
  company: aiNullableString(120).optional(),
  counterpartEmail: aiNullableString(200).optional(),
  senderInitials: aiNullableString(80).optional(),
  theme: aiNullableString(200).optional(),
  reason: aiString(400).optional(),
});

export const ExistingDayTaskRefSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  status: z.enum(["open", "done"]),
  doneAt: z.string().max(80).nullable().optional(),
  href: z.string().max(500).nullable().optional(),
  match: z.enum(["title", "theme", "notes"]),
  source: z.enum(["todo", "planner", "google"]).nullable().optional(),
});

/** Apply-Body: AI-Felder + optionaler To-Do-Treffer. */
export const MsDayTaskApplySchema = MsDayTaskSuggestionSchema.extend({
  existingTask: ExistingDayTaskRefSchema.nullable().optional(),
});

export const MsDayEventSuggestionSchema = z.object({
  title: aiStringRequired(200, "Termin"),
  date: Ymd,
  startTime: Hm.nullable().optional(),
  endTime: Hm.nullable().optional(),
  allDay: z.boolean().optional(),
  location: aiNullableString(300).optional(),
  notes: aiNullableString(2000).optional(),
  sourceMailId: aiNullableString(200).optional(),
  sourceSubject: aiNullableString(300).optional(),
  company: aiNullableString(120).optional(),
  counterpartEmail: aiNullableString(200).optional(),
  theme: aiNullableString(200).optional(),
  reason: aiString(400).optional(),
  /** Automatisch aus Aufgaben-Vorschlag erzeugt — Slotwahl vor Anlegen. */
  fromTaskTwin: z.boolean().optional(),
});

export const MsDayReplyDraftSchema = z.object({
  /** Empty after coerce → dropped in enrichCluster. */
  to: aiString(200),
  subject: aiString(300),
  body: aiString(4000),
  /** Sprache des Antworttexts — muss zur Kunden-Anfrage passen. */
  language: z.enum(["de", "en"]).optional(),
  sourceMailId: aiNullableString(200).optional(),
  company: aiNullableString(120).optional(),
  theme: aiNullableString(200).optional(),
  reason: aiString(400).optional(),
});

function aiItemArray<T extends z.ZodTypeAny>(itemSchema: T, max: number) {
  return z.preprocess((v) => {
    if (!Array.isArray(v)) return [];
    const out: z.infer<T>[] = [];
    for (const el of v) {
      const r = itemSchema.safeParse(el);
      if (r.success) out.push(r.data);
      if (out.length >= max) break;
    }
    return out;
  }, z.array(itemSchema).max(max));
}

export const MsDayClusterSchema = z.object({
  /** Echo of THREAD seedKey — preferred for matching. */
  seedKey: aiNullableString(200).optional(),
  company: aiStringRequired(120, "Unbekannt"),
  counterpartEmail: aiNullableString(200).optional(),
  theme: aiStringRequired(200, "Thema"),
  conversationId: aiNullableString(200).optional(),
  summary: aiString(2200),
  mailIds: z.array(aiString(200)).max(40).default([]),
  status: z.enum(["open", "waiting", "done", "fyi"]).optional(),
  /** false = nur Info / keine Task/Reply nötig (UI-Chip). */
  actionNeeded: z.boolean().optional(),
  tasks: aiItemArray(MsDayTaskSuggestionSchema, 6).default([]),
  events: aiItemArray(MsDayEventSuggestionSchema, 4).default([]),
  replies: aiItemArray(MsDayReplyDraftSchema, 3).default([]),
});
export const MsDayMailAnalysisSchema = z.object({
  daySummary: z.string().max(3200),
  /** One cluster per conversation/thread. */
  clusters: z.array(MsDayClusterSchema).max(80),
});

const MsDayBatchClustersSchema = z.object({
  clusters: z.array(MsDayClusterSchema).max(20),
});

const MsDaySummaryOnlySchema = z.object({
  daySummary: z.string().max(3200),
});

export type ExistingDayTaskRef = z.infer<typeof ExistingDayTaskRefSchema>;

export type MsDayTaskSuggestion = z.infer<typeof MsDayTaskSuggestionSchema> & {
  /** Treffer in Google Tasks / Outlook To Do (nach Analyse angereichert). */
  existingTask?: ExistingDayTaskRef | null;
};
export type MsDayEventSuggestion = z.infer<typeof MsDayEventSuggestionSchema>;
export type MsDayReplyDraft = z.infer<typeof MsDayReplyDraftSchema>;
export type MsDayCluster = z.infer<typeof MsDayClusterSchema> & {
  tasks: MsDayTaskSuggestion[];
  actionNeeded?: boolean;
};
export type MsDayMailAnalysis = z.infer<typeof MsDayMailAnalysisSchema> & {
  clusters: MsDayCluster[];
  tasks: MsDayTaskSuggestion[];
  events: MsDayEventSuggestion[];
  replies: MsDayReplyDraft[];
  usage?: AiTokenUsage | null;
};

const GENERIC_MAIL_HOSTS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "yahoo.de",
  "gmx.ch",
  "gmx.net",
  "gmx.de",
  "bluewin.ch",
  "proton.me",
  "protonmail.com",
]);

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function titleCaseWord(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Lesbarer Absendername (nicht Kürzel). */
export function senderDisplayName(
  displayName?: string | null,
  email?: string | null
): string | null {
  let name = (displayName || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // "Raphael Altenberger · AN Group" → Name
  name = name.replace(/\s*[·|].*$/, "").trim();
  if (name.includes("@")) {
    const before = name.split("@")[0]?.trim() || "";
    name = before;
  }
  if (name && name !== "—" && !/^[^a-zA-ZÀ-ÿ]*$/.test(name) && name.length >= 2) {
    // "raphael.altenberger" aus Anzeige → schön formatieren
    if (/^[a-z0-9._+-]+$/i.test(name) && /[._+-]/.test(name)) {
      return name
        .split(/[._+-]+/)
        .filter(Boolean)
        .map(titleCaseWord)
        .join(" ")
        .slice(0, 80);
    }
    return name.slice(0, 80);
  }
  const local = ((email || "").split("@")[0] || "").trim();
  if (!local) return null;
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(" ")
    .slice(0, 80) || null;
}

/** @deprecated Kürzel nur noch intern/Tests — UI nutzt vollen Namen. */
export function senderInitials(
  displayName?: string | null,
  email?: string | null
): string | null {
  const full = senderDisplayName(displayName, email);
  if (!full) return null;
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = stripDiacritics(parts[0]![0] || "");
    const b = stripDiacritics(parts[parts.length - 1]![0] || "");
    if (a && b) return (a + b).toUpperCase();
  }
  return stripDiacritics(full.slice(0, 2)).toUpperCase() || null;
}

/** Trailing (Kürzel) oder alten Absender-Suffix entfernen. */
export function stripTrailingSenderSuffix(title: string): string {
  return title
    .replace(/\s*\([A-Za-zÀ-ÿÄÖÜäöü .'-]{1,60}\)\s*$/u, "")
    .trim();
}

/** Titel mit (Voller Absendername) am Ende. */
export function withSenderLabel(
  title: string,
  senderName: string | null | undefined
): string {
  const base = stripTrailingSenderSuffix(title);
  if (!senderName?.trim()) return base;
  return `${base} (${senderName.trim()})`;
}

/** @deprecated use withSenderLabel */
export function withSenderInitials(
  title: string,
  initials: string | null | undefined
): string {
  return withSenderLabel(title, initials);
}

export function guessCompanyLabel(input: {
  email?: string | null;
  displayName?: string | null;
}): string | null {
  const email = (input.email || "").trim().toLowerCase();
  const domain = emailDomain(email);
  if (domain && !GENERIC_MAIL_HOSTS.has(domain)) {
    const base = domain.split(".")[0] || domain;
    if (base.length >= 2) {
      return base
        .split(/[-_]+/)
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join("-");
    }
  }
  const name = (input.displayName || "").trim();
  if (name && name !== "—" && !name.includes("@")) {
    const cleaned = name.replace(/\s*[·|].*$/, "").trim();
    if (cleaned.length >= 2 && cleaned.length <= 80) return cleaned;
  }
  return domain;
}

export function counterpartForMail(m: MsMailItem): {
  email: string | null;
  company: string | null;
} {
  if (m.folder === "sent") {
    const email = m.toEmails?.[0] || null;
    const company = guessCompanyLabel({
      email,
      displayName: m.toPreview,
    });
    return { email, company };
  }
  return {
    email: m.fromEmail,
    company: guessCompanyLabel({
      email: m.fromEmail,
      displayName: m.from,
    }),
  };
}

/** Ursprünglicher Absender (Inbox bevorzugen — nie „ich selbst“ aus Gesendet). */
export function originalSenderForCluster(mails: MsMailItem[]): {
  name: string | null;
  email: string | null;
  initials: string | null;
} {
  const inbox =
    mails.find((m) => m.folder === "inbox") ||
    [...mails]
      .filter((m) => m.folder === "inbox")
      .sort((a, b) =>
        (b.receivedOrSentAt || "").localeCompare(a.receivedOrSentAt || "")
      )[0] ||
    null;
  if (inbox) {
    const name = senderDisplayName(inbox.from, inbox.fromEmail);
    return {
      name,
      email: inbox.fromEmail,
      initials: senderInitials(inbox.from, inbox.fromEmail),
    };
  }
  // Nur Gesendet: Gegenstelle = Empfänger
  const sent = mails.find((m) => m.folder === "sent") || mails[0];
  if (!sent) return { name: null, email: null, initials: null };
  const email = sent.toEmails?.[0] || null;
  const name = senderDisplayName(sent.toPreview, email);
  return {
    name,
    email,
    initials: senderInitials(sent.toPreview, email),
  };
}

function formatMailBlock(
  m: MsMailItem,
  indexLabel: string,
  bodyLimit = 2200
): string {
  const body = stripMailBodyNoise(m.bodyText || m.preview || "").slice(
    0,
    bodyLimit
  );
  const { email, company } = counterpartForMail(m);
  const absender =
    m.folder === "inbox"
      ? senderDisplayName(m.from, m.fromEmail)
      : senderDisplayName(m.toPreview, m.toEmails?.[0]);
  const langHint = detectReplyLanguage(`${m.subject}\n${body}`);
  const addressHint = detectReplyAddressForm(`${m.subject}\n${body}`);
  const rangeTag =
    m.inRange === false
      ? "Kontext (ausserhalb Selektion)"
      : "im Selektionzeitraum";
  return `[${indexLabel}|${m.folder}|id=${m.id}|conv=${m.conversationId || "—"}|${rangeTag}]
Gegenstelle: ${company || "unbekannt"}${email ? ` <${email}>` : ""}
Absender-Name für Aufgaben: ${absender || "—"}
Von: ${m.from}${m.fromEmail ? ` <${m.fromEmail}>` : ""}
An: ${m.toPreview || "—"}
Betreff: ${m.subject}
Zeit: ${m.receivedOrSentAt || "—"}
Textsprache (Heuristik): ${langHint === "en" ? "EN" : "DE"}
Anrede in dieser Mail (Heuristik): ${
    addressHint === "du"
      ? "per Du"
      : addressHint === "formal"
        ? "formell"
        : "unklar"
  }
Text:
${body || "(leer)"}`;
}

/** Strip signatures / separator junk before the model sees the body. */
export function stripMailBodyNoise(text: string): string {
  let t = text.replace(/\r\n/g, "\n");
  const cuts: RegExp[] = [
    /\n-- \n/,
    /\n_{5,}\n/,
    /\nMit freundlichen Gr(?:ü|ue)ssen\b/i,
    /\nFreundliche Gr(?:ü|ue)sse\b/i,
    /\nBeste Gr(?:ü|ue)sse\b/i,
    /\nBest regards\b/i,
    /\nKind regards\b/i,
    /\nViele Gr(?:ü|ue)sse\b/i,
    /\nSent from (?:my )?/i,
    /\nVon meinem (?:iPhone|iPad|Galaxy)\b/i,
    /\nGet Outlook for\b/i,
    /\nDiese E-Mail und alle Anh(?:ä|ae)nge\b/i,
    /\nThis (?:e-?mail|message) and any attachments\b/i,
    /\nConfidential(?:ity)? notice\b/i,
  ];
  for (const re of cuts) {
    const m = re.exec(t);
    if (m && typeof m.index === "number" && m.index > 60) {
      t = t.slice(0, m.index);
    }
  }
  t = t
    .split("\n")
    .filter((line) => !/^\s*[\*\-=_]{5,}\s*$/.test(line))
    .join("\n");
  return t.replace(/\*{5,}/g, "").trim();
}

export function cleanClusterSummaryNoise(summary: string): string {
  return summary
    .split("\n")
    .filter((line) => !/^\s*[\*\-=_]{5,}\s*$/.test(line))
    .join("\n")
    .replace(/\*{5,}/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function packMailsForPrompt(
  inbox: MsMailItem[],
  sent: MsMailItem[],
  caps?: { inbox?: number; sent?: number; total?: number }
): string {
  const all = [...inbox, ...sent];
  const inRange = all.filter((m) => m.inRange !== false);
  const context = all.filter((m) => m.inRange === false);

  // Prefer in-range seeds, then attach full thread context for those conversations.
  const seedCap = caps?.total ?? Math.max(
    (caps?.inbox ?? 40) + (caps?.sent ?? 30),
    80
  );
  const seedIds = new Set<string>();
  const seedConvs = new Set<string>();
  const selected: MsMailItem[] = [];

  for (const m of inRange) {
    if (selected.length >= seedCap) break;
    selected.push(m);
    seedIds.add(m.id);
    if (m.conversationId?.trim()) seedConvs.add(m.conversationId.trim());
  }

  for (const m of context) {
    if (selected.length >= seedCap + 40) break;
    const conv = m.conversationId?.trim();
    if (!conv || !seedConvs.has(conv)) continue;
    if (seedIds.has(m.id)) continue;
    selected.push(m);
    seedIds.add(m.id);
  }

  // Fallback: if nothing had inRange flags, keep legacy slice behaviour.
  if (selected.length === 0 && all.length > 0) {
    const inboxCap = caps?.inbox ?? 20;
    const sentCap = caps?.sent ?? 12;
    selected.push(...inbox.slice(0, inboxCap), ...sent.slice(0, sentCap));
  }

  type Thread = { key: string; mails: MsMailItem[] };
  const threads = new Map<string, Thread>();
  const order: string[] = [];

  function add(m: MsMailItem) {
    const key = m.conversationId?.trim() || `solo:${m.folder}:${m.id}`;
    let t = threads.get(key);
    if (!t) {
      t = { key, mails: [] };
      threads.set(key, t);
      order.push(key);
    }
    t.mails.push(m);
  }

  for (const m of selected) add(m);

  for (const t of threads.values()) {
    t.mails.sort((a, b) =>
      (a.receivedOrSentAt || "").localeCompare(b.receivedOrSentAt || "")
    );
  }

  let n = 0;
  const blocks: string[] = [];
  for (const key of order) {
    const t = threads.get(key)!;
    const counterparts = [
      ...new Set(
        t.mails
          .map((m) => {
            const c = counterpartForMail(m);
            return [c.company, c.email].filter(Boolean).join(" ");
          })
          .filter(Boolean)
      ),
    ].slice(0, 3);
    const contextCount = t.mails.filter((m) => m.inRange === false).length;
    const header =
      t.mails.length > 1
        ? `=== THREAD (${t.mails.length} Mails` +
          (contextCount
            ? `, davon ${contextCount} Kontext ausserhalb Selektion`
            : "") +
          ` · ${counterparts.join(" · ") || "Gegenstelle unbekannt"} · conv=${t.mails[0]?.conversationId || "—"}) ===`
        : `=== MAIL ===`;
    const body = t.mails
      .map((m) => {
        n += 1;
        return formatMailBlock(m, `#${n}`);
      })
      .join("\n\n");
    blocks.push(`${header}\n${body}`);
  }

  const inRangeCount = all.filter((m) => m.inRange !== false).length;
  const contextCount = all.filter((m) => m.inRange === false).length;

  return [
    `Posteingang geladen: ${inbox.length}`,
    `Gesendet geladen: ${sent.length}`,
    `Im Selektionzeitraum: ${inRangeCount} · Thread-Kontext ausserhalb: ${contextCount}`,
    `Im Prompt: ${selected.length} Mails / ${order.length} Threads`,
    "Hinweis: Kontext-Mails gehören zu Threads mit Aktivität im Selektionzeitraum — vollständig berücksichtigen.",
    "",
    blocks.join("\n\n---\n\n") || "(keine Mails)",
  ].join("\n");
}

function resolveMail(
  sourceMailId: string | null | undefined,
  sourceSubject: string | null | undefined,
  byId: Map<string, MsMailItem>
): MsMailItem | null {
  if (sourceMailId && byId.has(sourceMailId)) {
    return byId.get(sourceMailId)!;
  }
  if (sourceSubject) {
    const want = sourceSubject.trim().toLowerCase();
    return (
      [...byId.values()].find((m) => m.subject.trim().toLowerCase() === want) ||
      null
    );
  }
  return null;
}

/** E-Mail aus AI-`to` oder Fallback (Name ohne @ → Gegenstelle). */
export function resolveReplyToEmail(
  rawTo: string | null | undefined,
  ...fallbacks: Array<string | null | undefined>
): string | null {
  const candidates = [rawTo, ...fallbacks];
  for (const raw of candidates) {
    const t = (raw || "").trim();
    if (!t) continue;
    const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(t);
    if (angle?.[1]) return angle[1].trim();
    if (t.includes("@") && !/\s/.test(t)) return t;
    const bare = /\b([^\s<>"]+@[^\s<>"]+)\b/.exec(t);
    if (bare?.[1]) return bare[1].trim();
  }
  return null;
}

function enrichCluster(
  cluster: z.infer<typeof MsDayClusterSchema>,
  byId: Map<string, MsMailItem>,
  idSet: Set<string>,
  dayIso: string
): MsDayCluster {
  const mailIds = (cluster.mailIds || []).filter((id) => idSet.has(id));
  const fromMails = mailIds
    .map((id) => byId.get(id))
    .filter((m): m is MsMailItem => Boolean(m));
  const seed =
    fromMails[0] ||
    resolveMail(
      cluster.tasks[0]?.sourceMailId,
      cluster.tasks[0]?.sourceSubject,
      byId
    ) ||
    resolveMail(
      cluster.events[0]?.sourceMailId,
      cluster.events[0]?.sourceSubject,
      byId
    ) ||
    null;
  const relatedMails = fromMails.length > 0 ? fromMails : seed ? [seed] : [];
  const counterpart = seed ? counterpartForMail(seed) : null;
  const company =
    cluster.company?.trim() || counterpart?.company || "Unbekannt";
  const counterpartEmail =
    cluster.counterpartEmail?.trim() || counterpart?.email || null;
  const theme = cluster.theme.trim();
  const conversationId =
    cluster.conversationId?.trim() ||
    seed?.conversationId ||
    fromMails.find((m) => m.conversationId)?.conversationId ||
    null;
  const sender = originalSenderForCluster(relatedMails);
  const defaultDue = addDaysYmd(dayIso, 1);

  const tasks = cluster.tasks
    .filter((t) => t.title.trim())
    .map((t) => {
      const mail = resolveMail(t.sourceMailId, t.sourceSubject, byId);
      const c = mail ? counterpartForMail(mail) : null;
      // Immer aus Mail ableiten — AI-Kürzel (DV)/(RW) nicht übernehmen
      const senderName =
        (mail ? originalSenderForCluster([mail]).name : null) || sender.name;
      return {
        ...t,
        title: withSenderLabel(t.title, senderName),
        dueDate: t.dueDate || defaultDue,
        sourceMailId:
          t.sourceMailId && idSet.has(t.sourceMailId)
            ? t.sourceMailId
            : mail?.id || null,
        sourceSubject: t.sourceSubject || mail?.subject || null,
        folder: t.folder || mail?.folder || null,
        company: t.company?.trim() || company,
        counterpartEmail:
          t.counterpartEmail?.trim() || counterpartEmail || c?.email || null,
        senderInitials: senderName,
        theme,
      };
    });

  const events = cluster.events
    .filter((e) => e.title.trim() && e.date)
    .map((e) => {
      const mail = resolveMail(e.sourceMailId, e.sourceSubject, byId);
      const c = mail ? counterpartForMail(mail) : null;
      const hasTime = Boolean(e.startTime);
      return {
        ...e,
        allDay: e.allDay ?? !hasTime,
        sourceMailId:
          e.sourceMailId && idSet.has(e.sourceMailId)
            ? e.sourceMailId
            : mail?.id || null,
        sourceSubject: e.sourceSubject || mail?.subject || null,
        company: e.company?.trim() || company,
        counterpartEmail:
          e.counterpartEmail?.trim() || counterpartEmail || c?.email || null,
        theme,
        fromTaskTwin: false as boolean | undefined,
      };
    });

  // Zu jeder Aufgabe denselben Vorschlag auch als Termin (ohne Uhrzeit → Slotwahl).
  const eventKeys = new Set(
    events.map(
      (e) => `${e.title.trim().toLowerCase().replace(/\s+/g, " ")}|${e.date}`
    )
  );
  const twinEvents: typeof events = [];
  for (const t of tasks) {
    const date = t.dueDate || defaultDue;
    const key = `${t.title.trim().toLowerCase().replace(/\s+/g, " ")}|${date}`;
    if (eventKeys.has(key)) continue;
    eventKeys.add(key);
    twinEvents.push({
      title: t.title,
      date,
      startTime: null,
      endTime: null,
      allDay: true,
      location: null,
      notes: t.notes || null,
      sourceMailId: t.sourceMailId || null,
      sourceSubject: t.sourceSubject || null,
      company: t.company || company,
      counterpartEmail: t.counterpartEmail || counterpartEmail,
      theme,
      reason: t.reason?.trim()
        ? `Aus Aufgabe: ${t.reason.trim()}`
        : "Aus Aufgaben-Vorschlag",
      fromTaskTwin: true,
    });
  }
  const allEvents = [...events, ...twinEvents];

  const replies = cluster.replies
    .filter((r) => r.subject.trim() && r.body.trim())
    .map((r) => {
      const mail =
        resolveMail(r.sourceMailId, null, byId) ||
        fromMails.find((m) => m.folder === "inbox") ||
        fromMails[0] ||
        null;
      const c = mail ? counterpartForMail(mail) : null;
      const to =
        resolveReplyToEmail(
          r.to,
          counterpartEmail,
          c?.email,
          sender.email,
          mail?.folder === "inbox" ? mail.fromEmail : mail?.toEmails?.[0]
        ) || "";
      // Aktuelle Textsprache (für UI-Toggle); Prompt soll schon korrekt liefern.
      const bodyLang = detectReplyLanguage(`${r.subject}\n${r.body}`);
      const lang: ReplyLang =
        r.language === "en" || r.language === "de" ? r.language : bodyLang;
      return {
        ...r,
        to,
        language: lang,
        subject: normalizeReplySubject(r.subject, lang),
        sourceMailId:
          r.sourceMailId && idSet.has(r.sourceMailId)
            ? r.sourceMailId
            : mail?.folder === "inbox"
              ? mail.id
              : fromMails.find((m) => m.folder === "inbox")?.id || null,
        company: r.company?.trim() || company,
        theme,
      };
    })
    .filter((r) => Boolean(resolveReplyToEmail(r.to)));

  return {
    company,
    counterpartEmail,
    theme,
    conversationId,
    summary: cleanClusterSummaryNoise(cluster.summary.trim()),
    mailIds: mailIds.length
      ? mailIds
      : fromMails.map((m) => m.id).slice(0, 40),
    status: cluster.status || "open",
    actionNeeded: normalizeActionNeeded(
      cluster.actionNeeded,
      cluster.status,
      tasks.length,
      allEvents.length,
      replies.length
    ),
    tasks,
    events: allEvents,
    replies,
  };
}

export function clusterNeedsAction(cluster: {
  actionNeeded?: boolean | null;
  status?: string | null;
  tasks?: unknown[];
  events?: unknown[];
  replies?: unknown[];
}): boolean {
  return normalizeActionNeeded(
    cluster.actionNeeded ?? undefined,
    cluster.status,
    cluster.tasks?.length || 0,
    cluster.events?.length || 0,
    cluster.replies?.length || 0
  );
}

function normalizeActionNeeded(
  raw: boolean | undefined,
  status: string | null | undefined,
  taskCount: number,
  eventCount: number,
  replyCount: number
): boolean {
  // Concrete deliverables always win over a soft "false".
  if (taskCount > 0 || eventCount > 0 || replyCount > 0) return true;
  // Open / waiting must stay actionable even if the model sets false.
  if (status === "open" || status === "waiting") return true;
  if (typeof raw === "boolean") return raw;
  return false;
}

export function sortClusters(clusters: MsDayCluster[]): MsDayCluster[] {
  const statusRank: Record<string, number> = {
    open: 0,
    waiting: 1,
    fyi: 2,
    done: 3,
  };
  return [...clusters].sort((a, b) => {
    const aa = clusterNeedsAction(a) ? 0 : 1;
    const bb = clusterNeedsAction(b) ? 0 : 1;
    if (aa !== bb) return aa - bb;
    const sa = statusRank[a.status || "open"] ?? 9;
    const sb = statusRank[b.status || "open"] ?? 9;
    if (sa !== sb) return sa - sb;
    const c = a.company.localeCompare(b.company, "de", { sensitivity: "base" });
    if (c !== 0) return c;
    return a.theme.localeCompare(b.theme, "de", { sensitivity: "base" });
  });
}

export function flattenAnalysis(
  clusters: MsDayCluster[],
  daySummary: string,
  usage?: AiTokenUsage | null
): MsDayMailAnalysis {
  return applySwissOrthographyToAnalysis({
    daySummary,
    clusters,
    tasks: clusters.flatMap((c) => c.tasks),
    events: clusters.flatMap((c) => c.events),
    replies: clusters.flatMap((c) => c.replies),
    usage: usage || null,
  });
}

/** Schweizer Orthografie: ß → ss (gesamte Tagesanalyse-Texte). */
export function applySwissOrthography(text: string): string {
  return text.replace(/\u00df/g, "ss").replace(/\u1e9e/g, "SS");
}

export function applySwissOrthographyToAnalysis(
  analysis: MsDayMailAnalysis
): MsDayMailAnalysis {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return applySwissOrthography(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === "usage") {
          out[k] = v;
          continue;
        }
        out[k] = walk(v);
      }
      return out;
    }
    return value;
  };
  return walk(analysis) as MsDayMailAnalysis;
}

export function emptyMailDayAnalysis(summary: string): MsDayMailAnalysis {
  return {
    daySummary: applySwissOrthography(summary),
    clusters: [],
    tasks: [],
    events: [],
    replies: [],
    usage: null,
  };
}

/** AI day digest: ein Cluster pro Thread (Batch), vollständig für den Zeitraum. */
export async function analyzeMicrosoftMailDay(input: {
  todayIso: string;
  /** Inclusive range start (defaults to todayIso). */
  fromYmd?: string;
  /** Inclusive range end (defaults to todayIso). */
  toYmd?: string;
  inbox: MsMailItem[];
  sent: MsMailItem[];
}): Promise<MsDayMailAnalysis> {
  if (!hasChatKey()) {
    throw new Error("OpenAI API-Key fehlt (Einstellungen).");
  }

  const fromYmd = input.fromYmd || input.todayIso;
  const toYmd = input.toYmd || input.todayIso;
  const defaultDue = addDaysYmd(toYmd, 1);
  const rangeLabel =
    fromYmd === toYmd ? fromYmd : `${fromYmd}–${toYmd}`;

  const inbox = input.inbox.filter((m) => !isExcludedFromMailAnalysis(m));
  const sent = input.sent.filter((m) => !isExcludedFromMailAnalysis(m));
  const excludedCount =
    input.inbox.length +
    input.sent.length -
    inbox.length -
    sent.length;

  const seeds = buildThreadSeeds(inbox, sent);
  if (seeds.length === 0) {
    const extra =
      excludedCount > 0
        ? ` (${excludedCount} Noise-Mails übersprungen: INFOBOARD/Monitoring)`
        : "";
    return emptyMailDayAnalysis(
      `Keine Mails für ${rangeLabel} gefunden.${extra}`
    );
  }

  const byId = new Map(
    [...inbox, ...sent].map((m) => [m.id, m] as const)
  );
  const idSet = new Set(byId.keys());

  // Mit DeepSeek-Thinking aus: etwas grössere Batches = weniger Roundtrips.
  const BATCH =
    seeds.length > 50 ? 5 : seeds.length > 25 ? 6 : seeds.length > 12 ? 8 : 10;
  const bodyLimit =
    seeds.length > 40 ? 700 : seeds.length > 20 ? 1100 : 1800;
  const mailsPerThread =
    seeds.length > 40 ? 4 : seeds.length > 20 ? 6 : 10;

  const batches: ThreadSeed[][] = [];
  for (let i = 0; i < seeds.length; i += BATCH) {
    batches.push(seeds.slice(i, i + BATCH));
  }

  const client = getChatClient();
  const model = getChatModel();
  const usages: AiTokenUsage[] = [];
  const aiByKey = new Map<string, z.infer<typeof MsDayClusterSchema>>();

  const system = buildClusterBatchSystemPrompt(defaultDue);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]!;
    const packed = packThreadSeedsForPrompt(batch, {
      bodyLimit,
      maxMailsPerThread: mailsPerThread,
    });
    const required = batch
      .map(
        (s, i) =>
          `${i + 1}. seedKey=${s.key} | company≈${s.company} | theme≈${s.themeHint} | conv=${s.conversationId || "—"} | mails=${s.mailIds.length}`
      )
      .join("\n");

    const user = `Analysezeitraum: ${rangeLabel} (nur dieser Zeitraum — keine Mails ausserhalb als «heute» interpretieren).
Batch ${bi + 1}/${batches.length} · Default dueDate: ${defaultDue}

PFLICHT: Genau ${batch.length} Cluster — einer pro seedKey unten. seedKey in jedem Cluster echoen. Keine zusammenfassen, keine weglassen.

AKTION vs INFO (wichtig):
- Default bei Business-Mail von Menschen: actionNeeded=true, status=open oder waiting.
- actionNeeded=false / status=fyi NUR bei klaren Newslettern, noreply-Automails, reinen Empfangsbestätigungen oder endgültig erledigten Threads ohne offene Frage.
- Offene Kundenfragen, «bitte», Rückmeldung erbeten, Zusagen, Deadlines, Ticket-Nachfragen, Terminabsprachen = IMMER actionNeeded=true und mindestens 1 task und/oder 1 reply.
- «In Arbeit» / Support-Tickets / Nachfass-Mails sind KEINE reinen Infos.

SUMMARY: 3–6 Sätze inhaltlicher Kern (wer will was, Stand, offene Punkte). NIEMALS Signaturen, Grussformeln, Adressen, Disclaimer, Trennlinien (***/---), «Sent from…».

SYSTEM INFOBOARD und [Monitoring] sind bereits ausgefiltert — nicht erfinden.

Seed-Liste:
${required}

${packed}

JSON:
{
  "clusters": [
    {
      "seedKey": "exakter seedKey aus der Liste",
      "company": "…",
      "counterpartEmail": "…"|null,
      "theme": "…",
      "conversationId": "conv oder null",
      "summary": "3–6 Sätze ohne Signatur/Trennlinien",
      "mailIds": ["id"],
      "status": "open"|"waiting"|"done"|"fyi",
      "actionNeeded": true|false,
      "tasks": [],
      "events": [],
      "replies": []
    }
  ]
}`;

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...getChatJsonRequestExtras(),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const usage = buildAiTokenUsage(model, completion.usage);
    if (usage) usages.push(usage);

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    if (!raw) {
      console.warn(
        `[mail-day-analyze] Batch ${bi + 1}/${batches.length}: leerer AI-Content — Fallback Seeds`
      );
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
    } catch {
      console.warn(
        `[mail-day-analyze] Batch ${bi + 1}/${batches.length}: JSON kaputt — Fallback Seeds`
      );
      continue;
    }

    const clustersRaw =
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { clusters?: unknown }).clusters)
        ? (parsed as { clusters: unknown[] }).clusters
        : [];
    const accepted = parseAiClustersLenient(clustersRaw);
    if (accepted.length === 0 && clustersRaw.length > 0) {
      console.warn(
        `[mail-day-analyze] Batch ${bi + 1}/${batches.length}: keine gültigen Cluster — Fallback Seeds`
      );
    }

    for (const c of accepted) {
      const key = matchClusterToSeedKey(c, batch);
      if (key) aiByKey.set(key, c);
    }
  }

  const clusters = sortClusters(
    seeds.map((seed) => {
      const ai = aiByKey.get(seed.key);
      const base = ai
        ? enrichCluster(
            {
              ...ai,
              conversationId: ai.conversationId || seed.conversationId,
              mailIds:
                ai.mailIds?.length > 0 ? ai.mailIds : seed.mailIds,
              company: ai.company?.trim() || seed.company,
              counterpartEmail:
                ai.counterpartEmail?.trim() || seed.counterpartEmail,
              theme: ai.theme?.trim() || seed.themeHint,
            },
            byId,
            idSet,
            toYmd
          )
        : enrichCluster(
            fallbackClusterFromSeed(seed),
            byId,
            idSet,
            toYmd
          );
      return base;
    })
  );

  const daySummary = await writeDaySummaryOverview({
    client,
    model,
    rangeLabel,
    clusters,
    usages,
    excludedCount,
  });

  const mergedUsage = mergeUsages(model, usages);
  return flattenAnalysis(clusters, daySummary, mergedUsage);
}

type ThreadSeed = {
  key: string;
  conversationId: string | null;
  mailIds: string[];
  company: string;
  counterpartEmail: string | null;
  themeHint: string;
  mails: MsMailItem[];
};

function buildThreadSeeds(
  inbox: MsMailItem[],
  sent: MsMailItem[]
): ThreadSeed[] {
  const all = [...inbox, ...sent];
  const inRange = all.filter((m) => m.inRange !== false);
  const byKey = new Map<string, MsMailItem[]>();
  const order: string[] = [];

  for (const m of inRange) {
    const key = m.conversationId?.trim() || `solo:${m.folder}:${m.id}`;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(m);
  }

  // Attach out-of-range context for same conversation
  for (const m of all) {
    if (m.inRange !== false) continue;
    const key = m.conversationId?.trim();
    if (!key || !byKey.has(key)) continue;
    byKey.get(key)!.push(m);
  }

  return order.map((key) => {
    const mails = [...(byKey.get(key) || [])].sort((a, b) =>
      (a.receivedOrSentAt || "").localeCompare(b.receivedOrSentAt || "")
    );
    const newest =
      [...mails].sort((a, b) =>
        (b.receivedOrSentAt || "").localeCompare(a.receivedOrSentAt || "")
      )[0] || mails[0]!;
    const counterpart = counterpartForMail(newest);
    const conversationId = newest.conversationId?.trim() || null;
    return {
      key,
      conversationId,
      mailIds: mails.map((m) => m.id),
      company: counterpart.company || "Unbekannt",
      counterpartEmail: counterpart.email,
      themeHint: (newest.subject || "Ohne Betreff").replace(
        /^(AW|Re|WG|Fwd):\s*/i,
        ""
      ).slice(0, 120),
      mails,
    };
  });
}

function packThreadSeedsForPrompt(
  seeds: ThreadSeed[],
  opts?: { bodyLimit?: number; maxMailsPerThread?: number }
): string {
  const bodyLimit = opts?.bodyLimit ?? 1800;
  const maxMails = opts?.maxMailsPerThread ?? 10;
  return seeds
    .map((s, i) => {
      // Neueste Mails priorisieren (Antwortbedarf meist am Ende).
      const ordered = [...s.mails].sort((a, b) =>
        (b.receivedOrSentAt || "").localeCompare(a.receivedOrSentAt || "")
      );
      const picked = ordered.slice(0, maxMails).reverse();
      const ourTexts = picked
        .filter((m) => m.folder === "sent")
        .map((m) => `${m.subject}\n${stripMailBodyNoise(m.bodyText || m.preview || "")}`);
      const allTexts = picked.map(
        (m) =>
          `${m.subject}\n${stripMailBodyNoise(m.bodyText || m.preview || "")}`
      );
      const addressForm = detectReplyAddressForm(allTexts, { ourTexts });
      const addressLine =
        addressForm === "du"
          ? "per Du (Hallo + Vorname; du/dir) — strikt einhalten"
          : addressForm === "formal"
            ? "formell (Sie / Herr|Frau + Name) — strikt einhalten"
            : "unklar — letzte eigene Sent-Mail spiegeln, sonst formell; nie mischen";
      const blocks = picked
        .map((m, j) => formatMailBlock(m, `#${i + 1}.${j + 1}`, bodyLimit))
        .join("\n\n");
      const omitted =
        s.mails.length > picked.length
          ? ` · +${s.mails.length - picked.length} ältere Mails weggelassen`
          : "";
      return `=== THREAD seedKey=${s.key} · ${picked.length}/${s.mails.length} Mails · ${s.company}${omitted} ===
Anrede-Muster für REPLIES: ${addressLine}
${replyAddressFormInstruction(addressForm, detectReplyLanguage(allTexts.join("\n")))}
${blocks}`;
    })
    .join("\n\n---\n\n");
}

function buildClusterBatchSystemPrompt(defaultDue: string): string {
  return `Du bist Buddy, Büro-Assistent (Schweiz, Europe/Zurich).

SCHREIBWEISE: Schweizer Hochdeutsch, kein ß (ss). Klar, vollständig.

CLUSTER (hart):
- Genau ein Cluster pro seedKey / THREAD-Block — seedKey immer zurückgeben.
- conversationId und mailIds aus dem Thread übernehmen.
- actionNeeded: Default true bei menschlicher Business-Mail. false nur bei Newsletter/System/noreply/reiner Empfangsbestätigung/erledigt ohne offene Frage.
- status=open|waiting wenn etwas offen ist; fyi nur bei klarer Info ohne Handlungsbedarf.
- Wenn actionNeeded=true: tasks und replies dürfen NICHT beide leer sein — mindestens eine konkrete Aufgabe oder eine Antwort.
- Offene Kundenfragen / Nachfassen / Ticket-Statusfragen: actionNeeded=true, Reply pflicht (Sprache der Anfrage de/en), optional Task.
- Nur Zeitraum der Analyse — keine Halluzinationen.

SUMMARY:
- Nur inhaltlicher Kern: Absicht, Stand, offene Punkte.
- Niemals Signaturen, Grussformeln, Adressen, Telefon, Disclaimer, Trennlinien (*** --- ___), «Sent from…».

TASKS: dueDate Default ${defaultDue}, Titel ohne Absender-Suffix.
REPLIES: to = E-Mail mit @; language de|en; subject und body als Strings (nie null); AW:/Re: passend.
ANREDE (hart): Pro Thread steht «Anrede-Muster für REPLIES». Entweder konsequent per Du ODER konsequent formell — nie mischen.
- per Du: Hallo/Hi + Vorname wie im Verlauf; du/dir/dein (DE) bzw. informal first-name (EN).
- formell: Sehr geehrte/r bzw. Herr/Frau + Name (DE) bzw. Dear Mr/Ms (EN); Sie/Ihnen.
- Eigene Sent-Mails im Thread haben Vorrang vor Kundenmails.
EVENTS: nur bei klarem Termin und gültigem date YYYY-MM-DD.
NUR JSON.`;
}

/** Per-cluster salvage: ein kaputter Event/Reply killt nicht den ganzen Batch. */
function parseAiClustersLenient(
  rawClusters: unknown[]
): z.infer<typeof MsDayClusterSchema>[] {
  const out: z.infer<typeof MsDayClusterSchema>[] = [];
  for (const raw of rawClusters) {
    const full = MsDayClusterSchema.safeParse(raw);
    if (full.success) {
      out.push(full.data);
      continue;
    }
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const stripped = MsDayClusterSchema.safeParse({
      ...o,
      tasks: Array.isArray(o.tasks) ? o.tasks : [],
      events: [],
      replies: Array.isArray(o.replies) ? o.replies : [],
    });
    if (stripped.success) {
      out.push(stripped.data);
      continue;
    }
    const summaryOnly = MsDayClusterSchema.safeParse({
      ...o,
      tasks: [],
      events: [],
      replies: [],
      summary:
        typeof o.summary === "string" && o.summary.trim()
          ? o.summary
          : "Thread erfasst (Teilantwort der AI).",
    });
    if (summaryOnly.success) out.push(summaryOnly.data);
  }
  return out;
}

function matchClusterToSeedKey(
  cluster: z.infer<typeof MsDayClusterSchema>,
  batch: ThreadSeed[]
): string | null {
  const seedKey = cluster.seedKey?.trim();
  if (seedKey) {
    const bySeed = batch.find((s) => s.key === seedKey);
    if (bySeed) return bySeed.key;
  }
  const conv = cluster.conversationId?.trim();
  if (conv) {
    const byConv = batch.find((s) => s.conversationId === conv);
    if (byConv) return byConv.key;
    const byKey = batch.find((s) => s.key === conv);
    if (byKey) return byKey.key;
  }
  for (const id of cluster.mailIds || []) {
    const hit = batch.find((s) => s.mailIds.includes(id));
    if (hit) return hit.key;
  }
  const theme = (cluster.theme || "").trim().toLowerCase();
  if (theme) {
    const hit = batch.find(
      (s) => s.themeHint.toLowerCase() === theme || s.key.toLowerCase() === theme
    );
    if (hit) return hit.key;
  }
  return null;
}

function fallbackClusterFromSeed(
  seed: ThreadSeed
): z.infer<typeof MsDayClusterSchema> {
  const newest =
    [...seed.mails].sort((a, b) =>
      (b.receivedOrSentAt || "").localeCompare(a.receivedOrSentAt || "")
    )[0] || seed.mails[0]!;
  const preview = (newest.bodyText || newest.preview || "").slice(0, 400);
  return {
    company: seed.company,
    counterpartEmail: seed.counterpartEmail,
    theme: seed.themeHint,
    conversationId: seed.conversationId,
    summary:
      `Thread «${seed.themeHint}» (${seed.mails.length} Mail(s)). ` +
      `Neueste Nachricht: ${preview || "(kein Text)"}`,
    mailIds: seed.mailIds,
    status: "fyi",
    actionNeeded: false,
    tasks: [],
    events: [],
    replies: [],
  };
}

function mergeUsages(
  model: string,
  usages: AiTokenUsage[]
): AiTokenUsage | null {
  if (usages.length === 0) return null;
  const costs = usages.map((u) => u.estimatedCostUsd);
  const estimatedCostUsd = costs.every((c) => c != null)
    ? costs.reduce((s, c) => s + (c as number), 0)
    : null;
  return {
    model,
    promptTokens: usages.reduce((s, u) => s + (u.promptTokens || 0), 0),
    completionTokens: usages.reduce(
      (s, u) => s + (u.completionTokens || 0),
      0
    ),
    totalTokens: usages.reduce((s, u) => s + (u.totalTokens || 0), 0),
    estimatedCostUsd,
  };
}

async function writeDaySummaryOverview(input: {
  client: ReturnType<typeof getChatClient>;
  model: string;
  rangeLabel: string;
  clusters: MsDayCluster[];
  usages: AiTokenUsage[];
  excludedCount?: number;
}): Promise<string> {
  const actionCount = input.clusters.filter((c) => clusterNeedsAction(c)).length;
  const taskCount = input.clusters.reduce((n, c) => n + c.tasks.length, 0);
  const replyCount = input.clusters.reduce((n, c) => n + c.replies.length, 0);
  const excludedNote =
    input.excludedCount && input.excludedCount > 0
      ? ` (${input.excludedCount} Noise-Mails ausgeklammert: INFOBOARD/Monitoring)`
      : "";
  const lines = input.clusters
    .slice(0, 80)
    .map((c) => {
      const flag = clusterNeedsAction(c) ? "AKTION" : "INFO";
      return `- [${flag}|${c.status || "?"}] ${c.company} · ${c.theme}: ${c.summary.slice(0, 180)}`;
    })
    .join("\n");

  try {
    const completion = await input.client.chat.completions.create({
      model: input.model,
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Buddy Büro-Assistent CH. Schreibe daySummary (5–10 Sätze, Schweizer Deutsch, kein ß). Erwähne grob Handlung vs. Info. NUR JSON {\"daySummary\":\"…\"}.",
        },
        {
          role: "user",
          content: `Zeitraum ${input.rangeLabel}${excludedNote}. Überblick aus ${input.clusters.length} Thread-Clustern (${actionCount} mit Aktion, ${taskCount} Tasks, ${replyCount} Replies):\n${lines}`,
        },
      ],
      ...getChatJsonRequestExtras(),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const usage = buildAiTokenUsage(input.model, completion.usage);
    if (usage) input.usages.push(usage);
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = MsDaySummaryOnlySchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.daySummary.trim()) {
      return parsed.data.daySummary.trim();
    }
  } catch {
    /* fall through */
  }

  return applySwissOrthography(
    `Zeitraum ${input.rangeLabel}: ${input.clusters.length} Threads analysiert` +
      `${excludedNote}, davon ${actionCount} mit Handlungsbedarf` +
      ` (${taskCount} Aufgaben, ${replyCount} Antwort-Entwürfe). Details in den einzelnen Clustern.`
  );
}
