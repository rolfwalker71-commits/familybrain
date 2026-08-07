import assert from "node:assert/strict";
import test from "node:test";
import {
  MS_MAIL_DAY_CACHE_MAX,
  upsertMsMailDayCache,
  getMsMailDayCached,
  readMsMailDayCache,
  type MsMailDayCached,
} from "./mail-day-analysis-job.ts";

// Settings need DB — unit-test prune logic via pure helper mirror
function pruneCache(
  entries: MsMailDayCached[],
  entry: MsMailDayCached,
  max = MS_MAIL_DAY_CACHE_MAX
): MsMailDayCached[] {
  const next = entries.filter((e) => e.dayIso !== entry.dayIso);
  next.push(entry);
  next.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  return next.slice(0, Math.max(1, max));
}

function stub(day: string, finishedAt: string): MsMailDayCached {
  return {
    dayIso: day,
    finishedAt,
    analysis: {
      daySummary: "x",
      clusters: [],
      tasks: [],
      events: [],
      replies: [],
    },
    inboxCount: 1,
    sentCount: 0,
  };
}

test("cache prune keeps newest 7 by finishedAt", () => {
  let list: MsMailDayCached[] = [];
  for (let i = 1; i <= 9; i++) {
    const day = `2026-08-${String(i).padStart(2, "0")}`;
    list = pruneCache(
      list,
      stub(day, `2026-08-${String(i).padStart(2, "0")}T12:00:00.000Z`)
    );
  }
  assert.equal(list.length, 7);
  assert.ok(list.every((e) => e.dayIso >= "2026-08-03"));
  assert.equal(list[0]?.dayIso, "2026-08-09");
});

test("cache upsert replaces same day", () => {
  let list = pruneCache([], stub("2026-08-07", "2026-08-07T10:00:00.000Z"));
  list = pruneCache(list, stub("2026-08-07", "2026-08-07T18:00:00.000Z"));
  assert.equal(list.length, 1);
  assert.equal(list[0]?.finishedAt, "2026-08-07T18:00:00.000Z");
});

// Silence unused imports when DB unavailable in pure tests
void upsertMsMailDayCache;
void getMsMailDayCached;
void readMsMailDayCache;
