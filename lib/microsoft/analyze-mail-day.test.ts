import assert from "node:assert/strict";
import { test } from "node:test";
import {
  flattenAnalysis,
  guessCompanyLabel,
  packMailsForPrompt,
  senderInitials,
  sortClusters,
  withSenderInitials,
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

test("senderInitials from name and email", () => {
  assert.equal(
    senderInitials("Marita Köpper", "marita.koepper@s-peers.com"),
    "MK"
  );
  assert.equal(senderInitials("Nicole Rengstorf", null), "NR");
  assert.equal(senderInitials(null, "n.rengstorf@scalepharm.com"), "NR");
  assert.equal(
    withSenderInitials("Zugänge einrichten", "NR"),
    "Zugänge einrichten (NR)"
  );
  assert.equal(
    withSenderInitials("Zugänge einrichten (NR)", "XX"),
    "Zugänge einrichten (NR)"
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
