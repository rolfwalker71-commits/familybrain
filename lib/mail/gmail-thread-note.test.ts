import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApplyThreadNoteHtml,
  buildApplyThreadNoteText,
} from "@/lib/mail/gmail-thread-note";

test("apply thread note HTML includes stamp and action titles", () => {
  const at = new Date("2026-08-07T13:58:00+02:00");
  const html = buildApplyThreadNoteHtml({
    appliedAt: at,
    actions: [
      {
        kind: "event",
        title: "UPS Paketlieferung - irugs.ch",
        startDate: "2026-08-11",
        startTime: "09:00",
        endTime: "12:00",
        notes: "Trackingnummer 1ZABC",
      },
      {
        kind: "task",
        title: "Paket annehmen",
        dueDate: "2026-08-11",
      },
    ],
  });
  assert.match(html, /Übernommen in Buddy/);
  assert.match(html, /UPS Paketlieferung/);
  assert.match(html, /Paket annehmen/);
  assert.match(html, /Europe\/Zurich/);
  assert.match(html, /📅|Termin/);
  assert.match(html, /09:00/);
});

test("apply thread note plain text has timestamp footer", () => {
  const text = buildApplyThreadNoteText({
    appliedAt: new Date("2026-08-07T13:58:00+02:00"),
    actions: [
      {
        kind: "note",
        title: "UPS Tracking",
        reference: "1Z2W4E846732490429",
      },
    ],
  });
  assert.match(text, /BUDDY/);
  assert.match(text, /1Z2W4E846732490429/);
  assert.match(text, /Buddy ·/);
});
