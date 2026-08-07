import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleDayBriefing,
  buildDayBriefingFacts,
  buildEveningDigest,
  formatContextPulse,
  resolveBriefingMode,
} from "./day-briefing.ts";

test("resolveBriefingMode maps Zurich-style hours", () => {
  assert.equal(resolveBriefingMode(7), "morning");
  assert.equal(resolveBriefingMode(14), "day");
  assert.equal(resolveBriefingMode(20), "evening");
});

test("formatContextPulse builds compact headline", () => {
  const facts = buildDayBriefingFacts({
    todayIso: "2026-08-07",
    hour: 8,
    nowHm: "08:00",
    todayCalendar: [
      {
        id: "a",
        title: "Arzt",
        date: "2026-08-07",
        time: "10:00",
        endTime: "11:00",
        planningRelevant: true,
      },
      {
        id: "b",
        title: "Meeting",
        date: "2026-08-07",
        time: "10:30",
        endTime: "11:30",
        planningRelevant: true,
      },
      {
        id: "c",
        title: "Abend",
        date: "2026-08-07",
        time: "18:00",
        planningRelevant: true,
      },
    ],
    chips: {
      triagePending: 0,
      openDueAmount: 120,
      openDueCount: 1,
      mailSuggestionsPending: 1,
      mailAnalyzedToday: 2,
    },
    driveMirror: { percent: 14, pending: 40 },
    upcomingBirthdays: [],
    mailAppliedToday: 0,
    tasksOverdue: 0,
  });
  const pulse = formatContextPulse(facts);
  assert.match(pulse.headline, /3 Termine/);
  assert.match(pulse.headline, /Konflikt/);
  assert.match(pulse.headline, /Mail-Triage/);
  assert.match(pulse.headline, /Drive 14/);
  assert.ok(pulse.detail?.includes("Arzt") || pulse.detail?.includes("Meeting"));
});

test("evening digest splits done / open", () => {
  const facts = buildDayBriefingFacts({
    todayIso: "2026-08-07",
    mode: "evening",
    hour: 20,
    nowHm: "20:00",
    todayCalendar: [
      {
        id: "a",
        title: "Standup",
        date: "2026-08-07",
        time: "09:00",
        planningRelevant: true,
      },
    ],
    chips: {
      triagePending: 1,
      openDueAmount: 0,
      openDueCount: 0,
      mailSuggestionsPending: 1,
      mailAnalyzedToday: 4,
    },
    driveMirror: null,
    upcomingBirthdays: [],
    mailAppliedToday: 2,
    tasksOverdue: 1,
  });
  const digest = buildEveningDigest(facts);
  assert.ok(digest.done.some((l) => l.includes("übernommen")));
  assert.ok(digest.open.some((l) => /Triage|Aufgabe/i.test(l)));
  const payload = assembleDayBriefing(facts, "Ruhiger Tag.");
  assert.equal(payload.prose, "Ruhiger Tag.");
  assert.equal(payload.mode, "evening");
});
