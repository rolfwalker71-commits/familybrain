import assert from "node:assert/strict";
import test from "node:test";
import {
  holidayBadge,
  holidaySubtitle,
  holidaysInRange,
} from "./swiss-holidays.ts";

test("holidayBadge and subtitle for cantons", () => {
  assert.equal(holidayBadge("CH"), "Feiertag");
  assert.equal(holidayBadge("UR"), "Feiertag UR");
  assert.equal(holidaySubtitle("UR"), "Uri · Altdorf");
  assert.equal(holidaySubtitle("ZH"), "Zürich · Regensdorf");
});

test("holidaysInRange filters by date", () => {
  const rows = [
    {
      date: "2026-08-01",
      name: "Bundesfeier",
      canton: "CH",
      types: ["Public"],
    },
    {
      date: "2026-08-15",
      name: "Maria Himmelfahrt",
      canton: "UR",
      types: ["Public"],
    },
    {
      date: "2026-12-25",
      name: "Weihnachten",
      canton: "CH",
      types: ["Public"],
    },
  ];
  const inAug = holidaysInRange(rows, "2026-08-01", "2026-08-31");
  assert.equal(inAug.length, 2);
  assert.equal(inAug[0]!.name, "Bundesfeier");
});
