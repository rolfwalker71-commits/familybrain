import assert from "node:assert/strict";
import test from "node:test";
import {
  MARI_TICKETS_SYNC_INTERVAL_MS,
  getMariTicketsWatchState,
} from "@/lib/mari/sync-tickets-if-due";
import { WORK_STATUS_IDS } from "@/lib/mari/status";

test("mari ticket poll interval is 10 minutes", () => {
  assert.equal(MARI_TICKETS_SYNC_INTERVAL_MS, 10 * 60 * 1000);
});

test("getMariTicketsWatchState returns shape without throwing", () => {
  const st = getMariTicketsWatchState();
  assert.equal(typeof st.configured, "boolean");
  assert.ok(Array.isArray(st.countsByStatus));
  assert.ok(Array.isArray(st.recentChanges));
  assert.equal(typeof st.total, "number");
});

test("getMariTicketsWatchState accepts ownerKey", () => {
  const st = getMariTicketsWatchState("admin");
  assert.equal(typeof st.total, "number");
});

test("getMariTicketsWatchState returns a row per default work status", () => {
  const st = getMariTicketsWatchState();
  assert.equal(st.countsByStatus.length, WORK_STATUS_IDS.length);
  assert.deepEqual(
    st.countsByStatus.map((c) => c.statusId),
    [...WORK_STATUS_IDS]
  );
  assert.equal(
    st.total,
    st.countsByStatus.reduce((s, c) => s + c.count, 0)
  );
});
