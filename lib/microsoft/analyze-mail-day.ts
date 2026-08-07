import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
import { emailDomain } from "@/lib/mail/mail-sender-prefs";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import { z } from "zod";

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Hm = z.string().regex(/^\d{2}:\d{2}$/);

export const MsDayTaskSuggestionSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).nullable().optional(),
  dueDate: Ymd.nullable().optional(),
  sourceMailId: z.string().max(200).nullable().optional(),
  sourceSubject: z.string().max(300).nullable().optional(),
  folder: z.enum(["inbox", "sent"]).nullable().optional(),
  company: z.string().max(120).nullable().optional(),
  counterpartEmail: z.string().max(200).nullable().optional(),
  theme: z.string().max(200).nullable().optional(),
  reason: z.string().max(400).optional(),
});

export const MsDayEventSuggestionSchema = z.object({
  title: z.string().min(1).max(200),
  date: Ymd,
  startTime: Hm.nullable().optional(),
  endTime: Hm.nullable().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(300).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  sourceMailId: z.string().max(200).nullable().optional(),
  sourceSubject: z.string().max(300).nullable().optional(),
  company: z.string().max(120).nullable().optional(),
  counterpartEmail: z.string().max(200).nullable().optional(),
  theme: z.string().max(200).nullable().optional(),
  reason: z.string().max(400).optional(),
});

export const MsDayReplyDraftSchema = z.object({
  to: z.string().min(3).max(200),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(4000),
  sourceMailId: z.string().max(200).nullable().optional(),
  company: z.string().max(120).nullable().optional(),
  theme: z.string().max(200).nullable().optional(),
  reason: z.string().max(400).optional(),
});

export const MsDayClusterSchema = z.object({
  company: z.string().min(1).max(120),
  counterpartEmail: z.string().max(200).nullable().optional(),
  theme: z.string().min(1).max(200),
  conversationId: z.string().max(200).nullable().optional(),
  summary: z.string().max(900),
  mailIds: z.array(z.string().max(200)).max(20).default([]),
  status: z.enum(["open", "waiting", "done", "fyi"]).optional(),
  tasks: z.array(MsDayTaskSuggestionSchema).max(6).default([]),
  events: z.array(MsDayEventSuggestionSchema).max(4).default([]),
  replies: z.array(MsDayReplyDraftSchema).max(3).default([]),
});

export const MsDayMailAnalysisSchema = z.object({
  daySummary: z.string().max(1600),
  clusters: z.array(MsDayClusterSchema).max(16),
});

export type MsDayTaskSuggestion = z.infer<typeof MsDayTaskSuggestionSchema>;
export type MsDayEventSuggestion = z.infer<typeof MsDayEventSuggestionSchema>;
export type MsDayReplyDraft = z.infer<typeof MsDayReplyDraftSchema>;
export type MsDayCluster = z.infer<typeof MsDayClusterSchema>;
export type MsDayMailAnalysis = z.infer<typeof MsDayMailAnalysisSchema> & {
  /** Flach aus Clustern — für UI/Apply. */
  tasks: MsDayTaskSuggestion[];
  events: MsDayEventSuggestion[];
  replies: MsDayReplyDraft[];
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

/** Ableitung eines Firmen-/Org-Labels aus Domain oder Anzeigenamen. */
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

function formatMailBlock(m: MsMailItem, indexLabel: string): string {
  const body = (m.bodyText || m.preview || "").slice(0, 900);
  const { email, company } = counterpartForMail(m);
  return `[${indexLabel}|${m.folder}|id=${m.id}|conv=${m.conversationId || "—"}]
Gegenstelle: ${company || "unbekannt"}${email ? ` <${email}>` : ""}
Von: ${m.from}${m.fromEmail ? ` <${m.fromEmail}>` : ""}
An: ${m.toPreview || "—"}
Betreff: ${m.subject}
Zeit: ${m.receivedOrSentAt || "—"}
Text:
${body || "(leer)"}`;
}

/** Inbox + Sent nach conversationId bündeln (Thread), sonst Einzelmails. */
export function packMailsForPrompt(
  inbox: MsMailItem[],
  sent: MsMailItem[],
  caps?: { inbox?: number; sent?: number }
): string {
  const inboxCap = caps?.inbox ?? 20;
  const sentCap = caps?.sent ?? 12;
  const inboxSlice = inbox.slice(0, inboxCap);
  const sentSlice = sent.slice(0, sentCap);

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

  for (const m of inboxSlice) add(m);
  for (const m of sentSlice) add(m);

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
    const header =
      t.mails.length > 1
        ? `=== THREAD (${t.mails.length} Mails · ${counterparts.join(" · ") || "Gegenstelle unbekannt"} · conv=${t.mails[0]?.conversationId || "—"}) ===`
        : `=== MAIL ===`;
    const body = t.mails
      .map((m) => {
        n += 1;
        return formatMailBlock(m, `#${n}`);
      })
      .join("\n\n");
    blocks.push(`${header}\n${body}`);
  }

  return [
    `Posteingang geladen: ${inbox.length} (im Prompt: ${inboxSlice.length})`,
    `Gesendet geladen: ${sent.length} (im Prompt: ${sentSlice.length})`,
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

function enrichCluster(
  cluster: z.infer<typeof MsDayClusterSchema>,
  byId: Map<string, MsMailItem>,
  idSet: Set<string>
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

  const tasks = cluster.tasks
    .filter((t) => t.title.trim())
    .map((t) => {
      const mail = resolveMail(t.sourceMailId, t.sourceSubject, byId);
      const c = mail ? counterpartForMail(mail) : null;
      return {
        ...t,
        sourceMailId:
          t.sourceMailId && idSet.has(t.sourceMailId) ? t.sourceMailId : mail?.id || null,
        sourceSubject: t.sourceSubject || mail?.subject || null,
        folder: t.folder || mail?.folder || null,
        company: t.company?.trim() || company,
        counterpartEmail: t.counterpartEmail?.trim() || counterpartEmail || c?.email || null,
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
          e.sourceMailId && idSet.has(e.sourceMailId) ? e.sourceMailId : mail?.id || null,
        sourceSubject: e.sourceSubject || mail?.subject || null,
        company: e.company?.trim() || company,
        counterpartEmail: e.counterpartEmail?.trim() || counterpartEmail || c?.email || null,
        theme,
      };
    });

  const replies = cluster.replies
    .filter((r) => r.to.trim() && r.subject.trim() && r.body.trim())
    .map((r) => {
      const mail =
        resolveMail(r.sourceMailId, null, byId) ||
        fromMails.find((m) => m.folder === "inbox") ||
        fromMails[0] ||
        null;
      const c = mail ? counterpartForMail(mail) : null;
      const to =
        r.to.trim() ||
        counterpartEmail ||
        c?.email ||
        "";
      return {
        ...r,
        to,
        sourceMailId:
          r.sourceMailId && idSet.has(r.sourceMailId)
            ? r.sourceMailId
            : mail?.folder === "inbox"
              ? mail.id
              : null,
        company: r.company?.trim() || company,
        theme,
      };
    })
    .filter((r) => r.to.includes("@"));

  return {
    company,
    counterpartEmail,
    theme,
    conversationId,
    summary: cluster.summary.trim(),
    mailIds: mailIds.length
      ? mailIds
      : fromMails.map((m) => m.id).slice(0, 20),
    status: cluster.status || "open",
    tasks,
    events,
    replies,
  };
}

export function sortClusters(clusters: MsDayCluster[]): MsDayCluster[] {
  const statusRank: Record<string, number> = {
    open: 0,
    waiting: 1,
    fyi: 2,
    done: 3,
  };
  return [...clusters].sort((a, b) => {
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
  daySummary: string
): MsDayMailAnalysis {
  return {
    daySummary,
    clusters,
    tasks: clusters.flatMap((c) => c.tasks),
    events: clusters.flatMap((c) => c.events),
    replies: clusters.flatMap((c) => c.replies),
  };
}

export function emptyMailDayAnalysis(summary: string): MsDayMailAnalysis {
  return {
    daySummary: summary,
    clusters: [],
    tasks: [],
    events: [],
    replies: [],
  };
}

/** AI day digest: Cluster nach Kunde/Thema/Thread → Tasks, Termine, Antworten. */
export async function analyzeMicrosoftMailDay(input: {
  todayIso: string;
  inbox: MsMailItem[];
  sent: MsMailItem[];
}): Promise<MsDayMailAnalysis> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt (Einstellungen).");
  }

  const packed = packMailsForPrompt(input.inbox, input.sent);

  const system = `Du bist Buddy, Haushalt-/Büro-Assistent (Schweiz, Deutsch, Europe/Zurich).
Analysiere die Mails des Tages (Posteingang + Gesendet).

Ablauf:
1) Gruppiere nach Kunde/Firma (Gegenstelle) und Thema/Thread. Gleiche conv=… = derselbe Thread (Eingang+Gesendet zusammen, nicht doppelt).
2) Pro Cluster: kurze Zusammenfassung was gelaufen ist und was offen ist.
3) Leite NUR sinnvolle nächste Schritte ab:
   - tasks: Handlung für dich (prüfen, einrichten, nachfassen)
   - events: Kalendertermine NUR wenn Datum/Zeit klar (Meeting, Deadline-Block, Call)
   - replies: Antwort-Entwurf NUR wenn eine kurze Mail sinnvoll ist (Zusage, Rückfrage, Status). body auf Deutsch, höflich, knapp.
Newsletter/Werbung weglassen. Keine erfundenen Fakten. Antworte NUR als JSON.

Sortiere clusters mental nach: erst offene Kunden, dann Firma A–Z, dann Thema.`;

  const user = `Heute: ${input.todayIso}

${packed}

JSON-Schema:
{
  "daySummary": "2–5 Sätze Überblick mit Firmennamen",
  "clusters": [
    {
      "company": "Firma",
      "counterpartEmail": "name@firma.ch"|null,
      "theme": "kurzes Thema",
      "conversationId": "conv-id oder null",
      "summary": "Was ist der Stand in diesem Thread?",
      "mailIds": ["id", "…"],
      "status": "open"|"waiting"|"done"|"fyi",
      "tasks": [
        {
          "title": "…",
          "notes": "…"|null,
          "dueDate": "YYYY-MM-DD"|null,
          "sourceMailId": "id"|null,
          "sourceSubject": "Betreff"|null,
          "folder": "inbox"|"sent"|null,
          "company": "Firma"|null,
          "counterpartEmail": "…"|null,
          "reason": "…"
        }
      ],
      "events": [
        {
          "title": "…",
          "date": "YYYY-MM-DD",
          "startTime": "HH:mm"|null,
          "endTime": "HH:mm"|null,
          "allDay": false,
          "location": "…"|null,
          "notes": "…"|null,
          "sourceMailId": "id"|null,
          "sourceSubject": "…"|null,
          "company": "…"|null,
          "counterpartEmail": "…"|null,
          "reason": "…"
        }
      ],
      "replies": [
        {
          "to": "name@firma.ch",
          "subject": "AW: …",
          "body": "kurze Antwort",
          "sourceMailId": "id der Inbox-Mail"|null,
          "company": "…"|null,
          "reason": "…"
        }
      ]
    }
  ]
}`;

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: getOpenAIModel(),
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI-Antwort war kein gültiges JSON.");
  }
  const result = MsDayMailAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`AI-Schema ungültig: ${result.error.message}`);
  }

  const byId = new Map(
    [...input.inbox, ...input.sent].map((m) => [m.id, m] as const)
  );
  const idSet = new Set(byId.keys());

  const clusters = sortClusters(
    result.data.clusters
      .map((c) => enrichCluster(c, byId, idSet))
      .filter((c) => c.theme || c.summary || c.tasks.length || c.events.length || c.replies.length)
  );

  return flattenAnalysis(clusters, result.data.daySummary.trim());
}
