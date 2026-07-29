import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardBriefing } from "./briefing.ts";

test("buildDashboardBriefing prioritizes overdue and open finance", () => {
  const lines = buildDashboardBriefing(
    {
      openDueFinanceCount: 3,
      openDueFinanceAmount: 4820,
      overdueDeadlinesCount: 2,
      deadlinesNext30Days: 5,
      warrantiesExpiringSoon: 1,
      pendingAnalysis: 0,
    },
    {
      topOpenInvoice: {
        vendor: "Gemeinde Altdorf",
        title: "Steuerrechnung",
        amount: 15098,
        currency: "CHF",
      },
      topWarranty: {
        product_name: "TP-Link",
        vendor: null,
        warranty_until: "2026-09-25",
      },
    },
    "2026-07-29"
  );

  assert.ok(lines.some((l) => l.includes("überfällig")));
  assert.ok(lines.some((l) => l.includes("Rechnungen offen")));
  assert.ok(lines.some((l) => l.includes("Gemeinde Altdorf")));
  assert.ok(lines.some((l) => l.includes("TP-Link")));
  assert.ok(lines.length <= 5);
});

test("buildDashboardBriefing empty when nothing urgent", () => {
  const lines = buildDashboardBriefing({
    openDueFinanceCount: 0,
    openDueFinanceAmount: 0,
    overdueDeadlinesCount: 0,
    deadlinesNext30Days: 0,
    warrantiesExpiringSoon: 0,
    pendingAnalysis: 0,
  });
  assert.deepEqual(lines, []);
});
