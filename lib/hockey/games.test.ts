import assert from "node:assert/strict";
import test from "node:test";
import { parseMatchup, parseHockeyGamesFromIcs } from "./games.ts";
import { resolveHockeyTeam } from "./teams.ts";

test("parseMatchup splits home and away", () => {
  assert.deepEqual(parseMatchup("HC Ambri-Piotta - HC Davos"), {
    homeLabel: "HC Ambri-Piotta",
    awayLabel: "HC Davos",
  });
  assert.equal(parseMatchup("Busy"), null);
});

test("resolveHockeyTeam maps calendar names", () => {
  assert.equal(resolveHockeyTeam("HC Ambri-Piotta").key, "hc-ambri-piotta");
  assert.equal(resolveHockeyTeam("ZSC Lions").key, "zsc-lions");
  assert.equal(resolveHockeyTeam("Fribourg-Gottéron").key, "fribourg-gotteron");
  assert.equal(resolveHockeyTeam("EHC Biel-Bienne").key, "ehc-biel");
});

test("parseHockeyGamesFromIcs builds home/away and opponent", () => {
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
DTSTART:20260910T174500Z
DTEND:20260910T201500Z
SUMMARY:HC Ambri-Piotta - HC Davos
LOCATION:Gottardo Arena
END:VEVENT
BEGIN:VEVENT
UID:test-2
DTSTART:20260919T174500Z
SUMMARY:Lausanne HC - HC Ambri-Piotta
LOCATION:Vaudoise Aréna
END:VEVENT
END:VCALENDAR`;
  const games = parseHockeyGamesFromIcs(ics);
  assert.equal(games.length, 2);
  assert.equal(games[0]!.isHome, true);
  assert.equal(games[0]!.opponent.key, "hc-davos");
  assert.equal(games[0]!.location, "Gottardo Arena");
  assert.equal(games[1]!.isHome, false);
  assert.equal(games[1]!.opponent.key, "lausanne-hc");
});
