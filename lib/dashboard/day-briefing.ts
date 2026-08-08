import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
import { findTimedOverlaps } from "@/lib/calendar/event-overlap";
import { formatCHF } from "@/lib/utils/format";

export type BriefingMode = "morning" | "day" | "evening";

export type DayBriefingFacts = {
  mode: BriefingMode;
  todayIso: string;
  calendarTodayCount: number;
  /** Google/O365 Termine mit ✅ Buddy-Erledigt */
  calendarReviewedDone: number;
  /** Planungsrelevante Termine ohne Erledigt-Markierung */
  calendarOpen: number;
  nextEventTitle: string | null;
  nextEventTime: string | null;
  conflictCount: number;
  mailTriagePending: number;
  docTriagePending: number;
  openDueCount: number;
  openDueAmount: number;
  drivePercent: number | null;
  drivePending: number | null;
  birthdayToday: string | null;
  mailAppliedToday: number;
  mailAnalyzedToday: number;
  tasksOverdue: number;
};

export type DayBriefingPayload = {
  mode: BriefingMode;
  headline: string;
  detail: string | null;
  prose: string | null;
  bullets: string[];
  done: string[];
  open: string[];
  facts: DayBriefingFacts;
};

/** Zurich wall-clock bits for briefing mode / scheduler windows. */
export function zurichNowParts(now = new Date()): {
  todayIso: string;
  hour: number;
  minute: number;
  hm: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "00";
  const todayIso = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const hm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { todayIso, hour, minute, hm };
}

export function resolveBriefingMode(hour: number): BriefingMode {
  if (hour < 11) return "morning";
  if (hour >= 18) return "evening";
  return "day";
}

export function buildDayBriefingFacts(input: {
  todayIso: string;
  mode?: BriefingMode;
  nowHm?: string;
  todayCalendar: Array<{
    id: string;
    title: string;
    date: string;
    time?: string | null;
    endTime?: string | null;
    planningRelevant?: boolean | null;
  }>;
  chips: {
    triagePending: number;
    openDueAmount: number;
    openDueCount: number;
    mailSuggestionsPending: number;
    mailAnalyzedToday: number;
  };
  driveMirror: { percent: number; pending: number } | null;
  upcomingBirthdays: Array<{ date: string; title: string }>;
  mailAppliedToday: number;
  tasksOverdue: number;
  hour?: number;
}): DayBriefingFacts {
  const { todayIso, nowHm = "12:00" } = input;
  const hour = input.hour ?? Number(nowHm.slice(0, 2));
  const mode = input.mode ?? resolveBriefingMode(hour);

  const planning = input.todayCalendar.filter(
    (i) => i.date === todayIso && i.planningRelevant !== false
  );
  const conflicts = findTimedOverlaps(
    planning.map((i) => ({
      id: i.id,
      title: i.title,
      date: i.date,
      time: i.time || "",
      endTime: i.endTime,
      planningRelevant: i.planningRelevant,
    })),
    todayIso
  );

  const upcoming = planning
    .filter((i) => i.time)
    .map((i) => ({
      ...i,
      mins: (() => {
        const m = /^(\d{1,2}):(\d{2})$/.exec((i.time || "").trim());
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      })(),
    }))
    .filter((i) => i.mins != null && i.mins >= (hmToMins(nowHm) ?? 0))
    .sort((a, b) => (a.mins ?? 0) - (b.mins ?? 0));

  const next = upcoming[0] || null;
  const bday = input.upcomingBirthdays.find((b) => b.date === todayIso);
  const reviewedDone = planning.filter((i) =>
    (i.title || "").trim().startsWith("✅")
  ).length;
  const calendarOpen = Math.max(0, planning.length - reviewedDone);

  return {
    mode,
    todayIso,
    calendarTodayCount: planning.length,
    calendarReviewedDone: reviewedDone,
    calendarOpen,
    nextEventTitle: next?.title ?? null,
    nextEventTime: next?.time ?? null,
    conflictCount: conflicts.length,
    mailTriagePending: input.chips.mailSuggestionsPending,
    docTriagePending: input.chips.triagePending,
    openDueCount: input.chips.openDueCount,
    openDueAmount: input.chips.openDueAmount,
    drivePercent: input.driveMirror?.percent ?? null,
    drivePending: input.driveMirror?.pending ?? null,
    birthdayToday: bday?.title ?? null,
    mailAppliedToday: input.mailAppliedToday,
    mailAnalyzedToday: input.chips.mailAnalyzedToday,
    tasksOverdue: input.tasksOverdue,
  };
}

function hmToMins(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Deterministic one-line context pulse (push + overview). */
export function formatContextPulse(facts: DayBriefingFacts): {
  headline: string;
  detail: string | null;
  bullets: string[];
} {
  const bits: string[] = [];
  if (facts.calendarTodayCount > 0) {
    bits.push(
      facts.calendarReviewedDone > 0
        ? `${facts.calendarReviewedDone}/${facts.calendarTodayCount} Termine erledigt`
        : `${facts.calendarTodayCount} ${plural(facts.calendarTodayCount, "Termin", "Termine")}`
    );
  } else {
    bits.push("keine Termine");
  }
  if (facts.conflictCount > 0) {
    bits.push(
      `${facts.conflictCount} ${plural(facts.conflictCount, "Konflikt", "Konflikte")}`
    );
  }
  if (facts.mailTriagePending > 0) {
    bits.push(
      `${facts.mailTriagePending} Mail-Triage`
    );
  }
  if (facts.docTriagePending > 0) {
    bits.push(
      `${facts.docTriagePending} Doc-Triage`
    );
  }
  if (facts.drivePercent != null && facts.drivePending != null && facts.drivePending > 0) {
    bits.push(`Drive ${facts.drivePercent} %`);
  }

  const headline =
    facts.mode === "evening"
      ? `Heute: ${bits.join(" · ")}`
      : `Heute: ${bits.join(" · ")}`;

  const detailParts: string[] = [];
  if (facts.nextEventTitle) {
    detailParts.push(
      `Nächster: ${[facts.nextEventTime, facts.nextEventTitle].filter(Boolean).join(" ")}`
    );
  }
  if (facts.openDueCount > 0) {
    detailParts.push(
      `${formatCHF(facts.openDueAmount)} offen (${facts.openDueCount})`
    );
  }
  if (facts.birthdayToday) {
    detailParts.push(facts.birthdayToday);
  }
  if (facts.tasksOverdue > 0) {
    detailParts.push(
      `${facts.tasksOverdue} ${plural(facts.tasksOverdue, "Aufgabe überfällig", "Aufgaben überfällig")}`
    );
  }

  const bullets = buildOpenBullets(facts);
  return {
    headline,
    detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
    bullets,
  };
}

function buildOpenBullets(facts: DayBriefingFacts): string[] {
  const open: string[] = [];
  if (facts.conflictCount > 0) {
    open.push(
      `${facts.conflictCount} ${plural(facts.conflictCount, "Terminkonflikt", "Terminkonflikte")}`
    );
  }
  if (facts.calendarOpen > 0 && facts.mode === "evening") {
    open.push(
      `${facts.calendarOpen} ${plural(facts.calendarOpen, "Termin noch offen", "Termine noch offen")}`
    );
  }
  if (facts.mailTriagePending > 0) {
    open.push(
      `${facts.mailTriagePending} ${plural(facts.mailTriagePending, "Mail zur Triage", "Mails zur Triage")}`
    );
  }
  if (facts.docTriagePending > 0) {
    open.push(
      `${facts.docTriagePending} ${plural(facts.docTriagePending, "Dokument zur Triage", "Dokumente zur Triage")}`
    );
  }
  if (facts.openDueCount > 0) {
    open.push(
      `${facts.openDueCount} ${plural(facts.openDueCount, "offene Zahlung", "offene Zahlungen")} (${formatCHF(facts.openDueAmount)})`
    );
  }
  if (facts.tasksOverdue > 0) {
    open.push(
      `${facts.tasksOverdue} ${plural(facts.tasksOverdue, "überfällige Aufgabe", "überfällige Aufgaben")}`
    );
  }
  if (facts.drivePending != null && facts.drivePending > 0) {
    open.push(`Drive-Spiegel: noch ${facts.drivePending} Dokumente`);
  }
  if (facts.nextEventTitle) {
    open.push(
      `Nächster Termin: ${[facts.nextEventTime, facts.nextEventTitle].filter(Boolean).join(" ")}`
    );
  }
  return open.slice(0, 6);
}

export function buildEveningDigest(facts: DayBriefingFacts): {
  headline: string;
  done: string[];
  open: string[];
} {
  const done: string[] = [];
  if (facts.mailAppliedToday > 0) {
    done.push(
      `${facts.mailAppliedToday} ${plural(facts.mailAppliedToday, "Mail übernommen", "Mails übernommen")}`
    );
  }
  if (facts.mailAnalyzedToday > 0) {
    done.push(
      `${facts.mailAnalyzedToday} ${plural(facts.mailAnalyzedToday, "Mail geprüft", "Mails geprüft")}`
    );
  }
  if (facts.calendarTodayCount > 0) {
    if (facts.calendarReviewedDone > 0) {
      done.push(
        `${facts.calendarReviewedDone} von ${facts.calendarTodayCount} ${plural(facts.calendarTodayCount, "Termin erledigt", "Terminen erledigt")}`
      );
    } else {
      done.push(
        `${facts.calendarTodayCount} ${plural(facts.calendarTodayCount, "Termin am Kalender", "Termine am Kalender")}`
      );
    }
  }
  if (done.length === 0) {
    done.push("Keine Buddy-Übernahmen heute");
  }

  const open = buildOpenBullets(facts);
  if (open.length === 0) {
    open.push("Nichts Dringendes offen");
  }

  return {
    headline:
      done.length > 0 || open.length > 0
        ? "Abend-Digest: erledigt / offen"
        : "Abend-Digest",
    done: done.slice(0, 5),
    open: open.slice(0, 5),
  };
}

export function assembleDayBriefing(
  facts: DayBriefingFacts,
  prose: string | null = null
): DayBriefingPayload {
  const pulse = formatContextPulse(facts);
  const evening =
    facts.mode === "evening" ? buildEveningDigest(facts) : null;
  return {
    mode: facts.mode,
    headline: pulse.headline,
    detail: pulse.detail,
    prose,
    bullets: pulse.bullets,
    done: evening?.done ?? [],
    open: evening?.open ?? pulse.bullets,
    facts,
  };
}

/** AI only reformulates fixed facts — never invents numbers. */
export async function polishBriefingWithAi(
  facts: DayBriefingFacts,
  pulse: { headline: string; detail: string | null; bullets: string[] }
): Promise<string | null> {
  if (!hasOpenAIKey()) return null;

  const isEvening = facts.mode === "evening";
  const digest = isEvening ? buildEveningDigest(facts) : null;

  const system = `Du bist Buddy, Haushalt-Assistent (Schweiz, Deutsch, knapp).
Formuliere NUR aus den gelieferten Fakten. Keine neuen Zahlen, Termine oder Namen erfinden.
Maximal 3 kurze Sätze. Ton: ${isEvening ? "ruhiger Tagesabschluss" : "klarer Morgen-/Tageslagebericht"}.`;

  const user = JSON.stringify(
    {
      mode: facts.mode,
      headline: pulse.headline,
      detail: pulse.detail,
      bullets: pulse.bullets,
      done: digest?.done ?? [],
      open: digest?.open ?? [],
      facts,
    },
    null,
    0
  );

  try {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: getOpenAIModel(),
      temperature: 0.3,
      max_tokens: 220,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Fakten (JSON):\n${user}\n\nSchreibe den kurzen Absatz auf Deutsch.`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() || "";
    return text || null;
  } catch {
    return null;
  }
}

export async function buildDayBriefingPayload(
  facts: DayBriefingFacts,
  opts?: { withAi?: boolean; aiTimeoutMs?: number }
): Promise<DayBriefingPayload> {
  const pulse = formatContextPulse(facts);
  let prose: string | null = null;
  if (opts?.withAi !== false && hasOpenAIKey()) {
    const timeoutMs = opts?.aiTimeoutMs ?? 2500;
    prose = await Promise.race([
      polishBriefingWithAi(facts, pulse),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), timeoutMs)
      ),
    ]);
  }
  return assembleDayBriefing(facts, prose);
}
