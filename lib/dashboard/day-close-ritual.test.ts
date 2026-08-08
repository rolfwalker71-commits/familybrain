import assert from "node:assert/strict";
import test from "node:test";
import {
  DAY_CLOSE_RITUAL_ID,
  buildDayCloseRitualItem,
  isDayCloseRitualComplete,
  isZurichWeekday,
  withDayCloseRitual,
} from "./day-close-ritual.ts";

test("isZurichWeekday distinguishes weekend", () => {
  // 2026-08-08 = Saturday, 2026-08-10 = Monday (Zurich)
  assert.equal(isZurichWeekday("2026-08-08"), false);
  assert.equal(isZurichWeekday("2026-08-09"), false);
  assert.equal(isZurichWeekday("2026-08-10"), true);
});

test("withDayCloseRitual injects only on weekdays", () => {
  const mon = withDayCloseRitual([], "2026-08-10");
  assert.equal(mon.length, 1);
  assert.equal(mon[0]!.id, DAY_CLOSE_RITUAL_ID);
  assert.equal(mon[0]!.time, "18:30");

  const sat = withDayCloseRitual([], "2026-08-08");
  assert.equal(sat.length, 0);
});

test("ritual complete when calendar clear and analyses done/null", () => {
  assert.equal(
    isDayCloseRitualComplete({
      calendarOpen: 0,
      googleDayDone: true,
      microsoftDayDone: null,
    }),
    true
  );
  assert.equal(
    isDayCloseRitualComplete({
      calendarOpen: 1,
      googleDayDone: true,
      microsoftDayDone: true,
    }),
    false
  );
  assert.equal(
    isDayCloseRitualComplete({
      calendarOpen: 0,
      googleDayDone: false,
      microsoftDayDone: true,
    }),
    false
  );
});
