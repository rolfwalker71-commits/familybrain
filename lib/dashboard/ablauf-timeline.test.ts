import assert from "node:assert/strict";
import test from "node:test";
import {
  filterAblaufTimelineItems,
  isAgendaItemPastGrace,
} from "@/lib/dashboard/ablauf-timeline";
import type { AgendaItem } from "@/lib/dashboard/overview";

function item(
  partial: Partial<AgendaItem> & Pick<AgendaItem, "id" | "date" | "title">
): AgendaItem {
  return {
    kind: "calendar",
    subtitle: null,
    amount: null,
    currency: null,
    documentId: null,
    href: null,
    badge: "Kalender",
    ...partial,
  };
}

test("isAgendaItemPastGrace hides after end + 30 min", () => {
  const meeting = item({
    id: "1",
    date: "2026-08-07",
    title: "Call",
    time: "08:00",
    endTime: "08:25",
  });
  assert.equal(
    isAgendaItemPastGrace(meeting, "2026-08-07", "08:54"),
    false
  );
  assert.equal(
    isAgendaItemPastGrace(meeting, "2026-08-07", "08:55"),
    true
  );
});

test("filterAblaufTimelineItems keeps first tomorrow only", () => {
  const items = [
    item({
      id: "past",
      date: "2026-08-07",
      title: "Alt",
      time: "09:00",
      endTime: "10:00",
    }),
    item({
      id: "live",
      date: "2026-08-07",
      title: "Noch",
      time: "16:00",
      endTime: "17:00",
    }),
    item({
      id: "m1",
      date: "2026-08-08",
      title: "F2 Früh",
      time: "06:30",
      endTime: "15:14",
    }),
    item({
      id: "m2",
      date: "2026-08-08",
      title: "Später",
      time: "09:00",
      endTime: "10:00",
    }),
  ];
  const out = filterAblaufTimelineItems(items, "2026-08-07", "15:00", 30);
  assert.deepEqual(
    out.map((i) => i.id),
    ["live", "m1"]
  );
});
