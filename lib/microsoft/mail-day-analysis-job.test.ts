import assert from "node:assert/strict";
import test from "node:test";
import {
  MS_MAIL_DAY_CACHE_MAX,
  type MsMailDayCached,
} from "./mail-day-analysis-job.ts";
import { mailAnalysisRangeKey } from "../mail/mail-analysis-range.ts";

function pruneCache(
  entries: MsMailDayCached[],
  entry: MsMailDayCached,
  max = MS_MAIL_DAY_CACHE_MAX
): MsMailDayCached[] {
  const next = entries.filter((e) => e.rangeKey !== entry.rangeKey);
  next.push(entry);
  next.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  return next.slice(0, Math.max(1, max));
}

function stub(from: string, to: string, finishedAt: string): MsMailDayCached {
  return {
    dayIso: to,
    fromYmd: from,
    toYmd: to,
    rangeKey: mailAnalysisRangeKey(from, to),
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

test("cache prune keeps newest 7 by finishedAt (range keys)", () => {
  let list: MsMailDayCached[] = [];
  for (let i = 1; i <= 9; i++) {
    const day = `2026-08-${String(i).padStart(2, "0")}`;
    list = pruneCache(
      list,
      stub(day, day, `2026-08-${String(i).padStart(2, "0")}T12:00:00.000Z`)
    );
  }
  assert.equal(list.length, 7);
  assert.ok(list.every((e) => e.fromYmd >= "2026-08-03"));
  assert.equal(list[0]?.rangeKey, "2026-08-09_2026-08-09");
});

test("cache upsert replaces same rangeKey", () => {
  let list = pruneCache(
    [],
    stub("2026-08-05", "2026-08-07", "2026-08-07T10:00:00.000Z")
  );
  list = pruneCache(
    list,
    stub("2026-08-05", "2026-08-07", "2026-08-07T18:00:00.000Z")
  );
  assert.equal(list.length, 1);
  assert.equal(list[0]?.finishedAt, "2026-08-07T18:00:00.000Z");
  assert.equal(list[0]?.rangeKey, "2026-08-05_2026-08-07");
});
