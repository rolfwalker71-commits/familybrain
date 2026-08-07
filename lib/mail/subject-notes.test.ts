import assert from "node:assert/strict";
import test from "node:test";
import {
  appendMailSubjectToNotes,
  buildSuggestionDescription,
  scrubEventScheduleFromNotes,
} from "@/lib/mail/subject-notes";

test("UPS-style description from context", () => {
  const desc = buildSuggestionDescription(
    {
      kind: "event",
      title: "UPS Paketlieferung - irugs.ch",
      startDate: "2026-08-11",
      notes: null,
    },
    {
      from: "mcinfo@ups.com",
      fromName: "UPS",
      subject: "Your Parcel Has Been Shipped",
      body: "Shipment for irugs.ch tracking 1Z2W4E846732490429 between 9:00 AM and 12:00 PM",
    }
  );
  assert.match(desc, /UPS Paketlieferung - irugs\.ch/);
  assert.match(desc, /Trackingnummer 1Z2W4E846732490429/i);
  assert.doesNotMatch(desc, /9:00|12:00|zwischen/i);
});

test("keeps rich AI notes and adds missing tracking", () => {
  const desc = buildSuggestionDescription(
    {
      kind: "task",
      title: "Paket annehmen",
      notes: "UPS Paketlieferung - irugs.ch - Zustellung vormittag",
      reference: "1Z2W4E846732490429",
    },
    {
      from: "mcinfo@ups.com",
      fromName: "UPS",
      subject: "Shipped",
      body: "tracking 1Z2W4E846732490429",
    }
  );
  assert.match(desc, /Zustellung vormittag/);
  assert.match(desc, /1Z2W4E846732490429/);
});

test("event notes drop location time duration", () => {
  const scrubbed = scrubEventScheduleFromNotes(
    "Meeting - ANG Schweiz - Efibach 38, 6473 Silenen - ab 16:00 Uhr - Dauer ca. 4 Stunden",
    {
      kind: "event",
      title: "Meeting - ANG Schweiz",
      startDate: "2026-08-08",
      startTime: "16:00",
      endTime: "20:00",
      location: "Efibach 38, 6473 Silenen",
    }
  );
  assert.equal(scrubbed, null);
});

test("event description keeps prep context and drops schedule", () => {
  const desc = buildSuggestionDescription(
    {
      kind: "event",
      title: "Besprechung - ANG Schweiz",
      startDate: "2026-08-08",
      startTime: "16:00",
      endTime: "19:15",
      location: "Efibach 38, 6473 Silenen",
      notes:
        "Rolf Walker · Treffen · Notebook und Batterien mitnehmen - Efibach 38, 6473 Silenen - ab 16:00 Uhr",
    },
    {
      from: "office@ang.ch",
      fromName: "ANG Schweiz",
      subject: "Besprechung am 08.08.2026",
      body: "Treffen mit Notebook",
    }
  );
  assert.match(desc, /Notebook und Batterien/i);
  assert.match(desc, /Rolf Walker/i);
  assert.doesNotMatch(desc, /Efibach|16:00/i);
});

test("appendMailSubjectToNotes keeps existing notes", () => {
  assert.equal(
    appendMailSubjectToNotes("schon da", "Betreff"),
    "schon da"
  );
  assert.equal(appendMailSubjectToNotes(null, "Betreff"), "Betreff");
});
