import assert from "node:assert/strict";
import { test } from "node:test";
import {
  closeoutStepsFor,
  firstOpenStepIndex,
  openStepCount,
  stepDone,
  type CloseoutStatusPayload,
} from "@/lib/closeout/steps";

const base: CloseoutStatusPayload = {
  todayIso: "2026-08-11",
  weekday: true,
  ritual: {
    calendarOpen: 2,
    googleDayDone: false,
    microsoftDayDone: true,
  },
  ritualComplete: false,
  mailTriageGoogle: 3,
  mailTriageMicrosoft: 0,
  ticketHourSuggestions: 1,
  googleConnected: true,
  microsoftConnected: true,
};

test("closeout steps differ by provider hrefs", () => {
  const g = closeoutStepsFor("google");
  const m = closeoutStepsFor("microsoft");
  assert.equal(g.length, 5);
  assert.ok(g[0].href.includes("/google"));
  assert.ok(m[0].href.includes("/microsoft"));
});

test("stepDone and firstOpenStepIndex track live status", () => {
  assert.equal(stepDone("calendar", "google", base), false);
  assert.equal(stepDone("triage", "microsoft", base), true);
  assert.equal(stepDone("day-analysis", "microsoft", base), true);
  assert.equal(stepDone("day-analysis", "google", base), false);
  assert.equal(firstOpenStepIndex("microsoft", base), 0); // calendar still open
  assert.equal(openStepCount("microsoft", base), 2); // calendar + ticket-hours
});

test("all clear marks done step complete", () => {
  const clear: CloseoutStatusPayload = {
    ...base,
    ritual: { calendarOpen: 0, googleDayDone: true, microsoftDayDone: true },
    mailTriageGoogle: 0,
    mailTriageMicrosoft: 0,
    ticketHourSuggestions: 0,
  };
  assert.equal(stepDone("done", "google", clear), true);
  assert.equal(firstOpenStepIndex("google", clear), 4);
  assert.equal(openStepCount("google", clear), 0);
});
