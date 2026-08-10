import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySwissOrthography,
  cleanClusterSummaryNoise,
  clusterNeedsAction,
  flattenAnalysis,
  guessCompanyLabel,
  MsDayClusterSchema,
  packMailsForPrompt,
  resolveReplyToEmail,
  senderDisplayName,
  sortClusters,
  stripMailBodyNoise,
  withSenderLabel,
  type MsDayCluster,
} from "@/lib/microsoft/analyze-mail-day";
import type { MsMailItem } from "@/lib/microsoft/mail-day";

function mail(
  partial: Partial<MsMailItem> & Pick<MsMailItem, "id" | "folder">
): MsMailItem {
  return {
    subject: "Test",
    from: "Sender",
    fromEmail: null,
    toPreview: null,
    toEmails: [],
    receivedOrSentAt: "2026-08-07T10:00:00Z",
    preview: "",
    bodyText: "Hallo",
    conversationId: null,
    webLink: null,
    isRead: true,
    ...partial,
  };
}

test("applySwissOrthography replaces ß with ss", () => {
  assert.equal(
    applySwissOrthography("Viele Grüße,\nRolf Walker"),
    "Viele Grüsse,\nRolf Walker"
  );
  assert.equal(applySwissOrthography("Strasse heisst so"), "Strasse heisst so");
});

test("flattenAnalysis applies Swiss orthography to replies", () => {
  const out = flattenAnalysis(
    [
      {
        company: "Test",
        counterpartEmail: null,
        theme: "Thema",
        conversationId: null,
        summary: "Großes Update",
        mailIds: [],
        status: "open",
        tasks: [],
        events: [],
        replies: [
          {
            to: "a@b.ch",
            subject: "AW: Test",
            body: "Freundliche Grüße",
            language: "de",
            sourceMailId: null,
            sourceSubject: null,
            company: null,
          },
        ],
      },
    ],
    "Überblick mit Maßnahme"
  );
  assert.equal(out.daySummary, "Überblick mit Massnahme");
  assert.equal(out.clusters[0]?.summary, "Grosses Update");
  assert.equal(out.replies[0]?.body, "Freundliche Grüsse");
});

test("guessCompanyLabel uses company domain, not gmail", () => {
  assert.equal(
    guessCompanyLabel({ email: "support@an-group.one" }),
    "An-Group"
  );
  assert.equal(
    guessCompanyLabel({ email: "rolf@gmail.com", displayName: "Rolf" }),
    "Rolf"
  );
});

test("senderDisplayName and full name suffix on tasks", () => {
  assert.equal(
    senderDisplayName("Raphael Altenberger", "raphael.altenberger@an-group.one"),
    "Raphael Altenberger"
  );
  assert.equal(
    senderDisplayName(null, "raphael.altenberger@an-group.one"),
    "Raphael Altenberger"
  );
  assert.equal(
    withSenderLabel("ELO Sync Problem beheben (DV)", "Raphael Altenberger"),
    "ELO Sync Problem beheben (Raphael Altenberger)"
  );
  assert.equal(
    withSenderLabel("Zugriff auf SAP HANA bereitstellen (RW)", "Nawazish Rasool"),
    "Zugriff auf SAP HANA bereitstellen (Nawazish Rasool)"
  );
});

test("packMailsForPrompt groups inbox+sent by conversationId", () => {
  const inbox = [
    mail({
      id: "in1",
      folder: "inbox",
      conversationId: "conv-a",
      fromEmail: "ops@elo.example",
      from: "ELO Support",
      subject: "ELO Sync",
      receivedOrSentAt: "2026-08-07T09:00:00Z",
    }),
  ];
  const sent = [
    mail({
      id: "out1",
      folder: "sent",
      conversationId: "conv-a",
      toEmails: ["ops@elo.example"],
      toPreview: "ELO Support <ops@elo.example>",
      subject: "AW: ELO Sync",
      receivedOrSentAt: "2026-08-07T11:00:00Z",
    }),
    mail({
      id: "out2",
      folder: "sent",
      conversationId: "conv-b",
      toEmails: ["hr@partner.ch"],
      subject: "Onboarding",
      receivedOrSentAt: "2026-08-07T12:00:00Z",
    }),
  ];
  const packed = packMailsForPrompt(inbox, sent);
  assert.match(packed, /THREAD \(2 Mails/);
  assert.match(packed, /elo\.example/);
  assert.ok(packed.indexOf("in1") < packed.indexOf("out1"));
});

test("sortClusters orders by status then company then theme", () => {
  const clusters: MsDayCluster[] = [
    {
      company: "Zebra",
      counterpartEmail: null,
      theme: "B",
      conversationId: null,
      summary: "z",
      mailIds: [],
      status: "open",
      tasks: [],
      events: [],
      replies: [],
    },
    {
      company: "Alpha",
      counterpartEmail: null,
      theme: "A",
      conversationId: null,
      summary: "a",
      mailIds: [],
      status: "open",
      tasks: [],
      events: [],
      replies: [],
    },
    {
      company: "Alpha",
      counterpartEmail: null,
      theme: "Done",
      conversationId: null,
      summary: "d",
      mailIds: [],
      status: "done",
      tasks: [],
      events: [],
      replies: [],
    },
  ];
  const sorted = sortClusters(clusters);
  assert.equal(sorted[0]!.company, "Alpha");
  assert.equal(sorted[0]!.theme, "A");
  assert.equal(sorted[1]!.company, "Zebra");
  assert.equal(sorted[2]!.status, "done");
});

test("resolveReplyToEmail recovers address from name or angle brackets", () => {
  assert.equal(
    resolveReplyToEmail("Raphael Altenberger", "raphael@an-group.one"),
    "raphael@an-group.one"
  );
  assert.equal(
    resolveReplyToEmail("Raphael <raphael@an-group.one>"),
    "raphael@an-group.one"
  );
  assert.equal(
    resolveReplyToEmail("raphael@an-group.one"),
    "raphael@an-group.one"
  );
  assert.equal(resolveReplyToEmail("nur Name", "auch kein mail"), null);
});

test("flattenAnalysis collects tasks events replies", () => {
  const flat = flattenAnalysis(
    [
      {
        company: "ELO",
        counterpartEmail: "ops@elo.example",
        theme: "Sync",
        conversationId: "c1",
        summary: "Sync kaputt",
        mailIds: ["1"],
        status: "open",
        tasks: [
          {
            title: "Fix Sync (ES)",
            company: "ELO",
            counterpartEmail: "ops@elo.example",
            theme: "Sync",
          },
        ],
        events: [
          {
            title: "Call ELO",
            date: "2026-08-08",
            startTime: "10:00",
            theme: "Sync",
            company: "ELO",
          },
        ],
        replies: [
          {
            to: "ops@elo.example",
            subject: "AW: Sync",
            body: "Wir prüfen das.",
            company: "ELO",
            theme: "Sync",
          },
        ],
      },
    ],
    "Tag mit ELO-Thema"
  );
  assert.equal(flat.tasks.length, 1);
  assert.equal(flat.events.length, 1);
  assert.equal(flat.replies.length, 1);
  assert.equal(flat.daySummary, "Tag mit ELO-Thema");
});

test("cluster schema coerces null reply subject/body from AI", () => {
  const parsed = MsDayClusterSchema.safeParse({
    company: "Acme",
    theme: "Info",
    summary: "Newsletter",
    replies: [
      {
        to: "a@b.com",
        subject: null,
        body: null,
      },
    ],
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.replies[0]?.subject, "");
  assert.equal(parsed.data.replies[0]?.body, "");
});

test("cluster schema keeps cluster when one event has invalid date", () => {
  const parsed = MsDayClusterSchema.safeParse({
    company: "Kunde",
    theme: "Projekt",
    summary: "Offene Frage",
    actionNeeded: true,
    tasks: [{ title: "Rückruf" }],
    events: [
      { title: "Call", date: null },
      { title: "Call OK", date: "2026-08-12", startTime: "10:00" },
    ],
    replies: [
      {
        to: "a@b.com",
        subject: "AW: Projekt",
        body: "Danke, wir melden uns.",
      },
    ],
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.events.length, 1);
  assert.equal(parsed.data.tasks.length, 1);
  assert.equal(parsed.data.replies.length, 1);
});

test("clusterNeedsAction ignores false when status is open", () => {
  assert.equal(
    clusterNeedsAction({
      actionNeeded: false,
      status: "open",
      tasks: [],
      events: [],
      replies: [],
    }),
    true
  );
  assert.equal(
    clusterNeedsAction({
      actionNeeded: false,
      status: "fyi",
      tasks: [],
      events: [],
      replies: [],
    }),
    false
  );
});

test("stripMailBodyNoise removes signatures and separators", () => {
  const raw = [
    "Hallo, bitte um Rückmeldung zum Ticket.",
    "",
    "****************************************",
    "Mit freundlichen Grüssen",
    "Andreas Thomet",
    "CT-X Holding AG",
  ].join("\n");
  const cleaned = stripMailBodyNoise(raw);
  assert.match(cleaned, /Rückmeldung/);
  assert.equal(cleaned.includes("Andreas Thomet"), false);
  assert.equal(cleaned.includes("****"), false);
  assert.equal(
    cleanClusterSummaryNoise("Stand ok.\n********\nWeiteres"),
    "Stand ok.\nWeiteres"
  );
});
