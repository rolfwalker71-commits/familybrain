import assert from "node:assert/strict";
import test from "node:test";
import {
  detectDeliveryWindow,
  detectMerchant,
  enrichMailAnalysisTitles,
} from "@/lib/mail/enrich-shipping-titles";

test("detectMerchant finds shop domain", () => {
  assert.equal(
    detectMerchant("Your order from irugs.ch is on the way via UPS"),
    "irugs.ch"
  );
});

test("detectDeliveryWindow EN range", () => {
  const w = detectDeliveryWindow(
    "Your package will arrive between 9:00 AM and 1:00 PM"
  );
  assert.ok(w);
  assert.equal(w!.startTime, "09:00");
  assert.equal(w!.endTime, "13:00");
});

test("detectDeliveryWindow DE range", () => {
  const w = detectDeliveryWindow("Zustellung zwischen 10 und 14 Uhr erwartet");
  assert.ok(w);
  assert.equal(w!.startTime, "10:00");
  assert.equal(w!.endTime, "14:00");
});

test("enrich titles and times for UPS + shop", () => {
  const out = enrichMailAnalysisTitles(
    {
      summary: "Paket",
      relevance: "high",
      suggestions: [
        {
          kind: "event",
          title: "Paketlieferung",
          startDate: "2026-08-11",
        },
        { kind: "task", title: "Paket annehmen", dueDate: "2026-08-11" },
        {
          kind: "note",
          title: "UPS Tracking",
          reference: "1Z2W4E846732490429",
        },
      ],
    },
    {
      from: "mcinfo@ups.com",
      fromName: "UPS",
      subject: "Your Parcel Has Been Shipped",
      body: "Shipment for irugs.ch tracking 1Z2W4E846732490429 between 9:00 AM and 12:00 PM",
    }
  );
  assert.equal(out.suggestions[0]?.title, "UPS Paketlieferung - irugs.ch");
  assert.equal(out.suggestions[0]?.startTime, "09:00");
  assert.equal(out.suggestions[0]?.endTime, "12:00");
  assert.match(out.suggestions[1]?.title || "", /UPS/);
  assert.match(out.suggestions[1]?.title || "", /irugs/);
});
