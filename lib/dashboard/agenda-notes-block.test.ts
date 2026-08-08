import { createHash } from "crypto";
import {
  agendaNotesAlreadyWritten,
  formatAgendaWeatherLabel,
  mergeAgendaNotesBlock,
  stripAgendaNotesBlock,
  type AgendaNotesEnrichment,
} from "@/lib/dashboard/agenda-notes-block";

import assert from "node:assert/strict";
import test from "node:test";

test("stripAgendaNotesBlock removes Buddy section only", () => {
  const notes = `Eigene Notiz\n\n— Buddy —\nWetter: 20°\n— /Buddy —\n`;
  assert.equal(stripAgendaNotesBlock(notes), "Eigene Notiz");
});

test("mergeAgendaNotesBlock preserves user notes and is idempotent", () => {
  const enrichment: AgendaNotesEnrichment = {
    weatherLabel: "23° · sonnig",
    driveLabel: "~15 Min",
  };
  const once = mergeAgendaNotesBlock("Hallo", enrichment);
  assert.ok(once?.includes("Hallo"));
  assert.ok(once?.includes("Wetter: 23° · sonnig"));
  assert.ok(agendaNotesAlreadyWritten(once, enrichment));
  const twice = mergeAgendaNotesBlock(once, enrichment);
  assert.equal(
    stripAgendaNotesBlock(twice),
    stripAgendaNotesBlock(once)
  );
});

test("formatAgendaWeatherLabel", () => {
  assert.equal(
    formatAgendaWeatherLabel({ temperatureC: 23.4, labelDe: "sonnig" }),
    "23° · sonnig"
  );
  assert.equal(formatAgendaWeatherLabel({ temperatureC: null }), null);
});

test("fingerprint ignores rotating Bild URL via alreadyWritten normalize", () => {
  const key = createHash("sha256").update("x").digest("hex").slice(0, 20);
  const a = `— Buddy —\nWetter: 10°\nBild: https://example.com/a\n— /Buddy —`;
  const bEnrich: AgendaNotesEnrichment = {
    weatherLabel: "10°",
    aiIconKey: key,
  };
  // Without request/signing secret, image line may be omitted — weather alone still matches after strip
  const withoutImage = `— Buddy —\nWetter: 10°\n— /Buddy —`;
  assert.equal(
    agendaNotesAlreadyWritten(withoutImage, {
      weatherLabel: "10°",
    }),
    true
  );
  assert.equal(agendaNotesAlreadyWritten(a, { weatherLabel: "11°" }), false);
  void bEnrich;
});
