import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attachExistingTasksToAnalysis,
  matchExistingDayTask,
  type DayTaskCatalogItem,
} from "@/lib/mail/day-task-catalog";
import type { MsDayMailAnalysis } from "@/lib/microsoft/analyze-mail-day";

const catalog: DayTaskCatalogItem[] = [
  {
    id: "1",
    title: "ELO Sync Problem beheben (Raphael Altenberger)",
    notes: "Thema: ELO Sync\nGegenstelle: AN Group",
    status: "open",
    doneAt: null,
    href: "https://to-do.office.com/tasks/",
    source: "todo",
  },
  {
    id: "2",
    title: "Angebot prüfen",
    notes: "Thema: Offerte Webseite",
    status: "done",
    doneAt: "2026-08-01T10:00:00Z",
    href: null,
    source: "planner",
  },
];

test("matchExistingDayTask finds open task by title", () => {
  const hit = matchExistingDayTask(
    {
      title: "ELO Sync Problem beheben (Buddy)",
      theme: "ELO Sync",
      company: "AN Group",
    },
    catalog
  );
  assert.ok(hit);
  assert.equal(hit?.id, "1");
  assert.equal(hit?.status, "open");
});

test("matchExistingDayTask finds done task by theme/notes", () => {
  const hit = matchExistingDayTask(
    {
      title: "Web-Offerte nochmals checken",
      theme: "Offerte Webseite",
      company: "Kunde",
    },
    catalog
  );
  assert.ok(hit);
  assert.equal(hit?.id, "2");
  assert.equal(hit?.status, "done");
  assert.equal(hit?.source, "planner");
});

test("attachExistingTasksToAnalysis enriches clusters and flat list", () => {
  const analysis = {
    daySummary: "Test",
    clusters: [
      {
        company: "AN Group",
        counterpartEmail: null,
        theme: "ELO Sync",
        conversationId: null,
        summary: "…",
        mailIds: [],
        status: "open" as const,
        tasks: [
          {
            title: "ELO Sync Problem beheben (Raphael)",
            theme: "ELO Sync",
            company: "AN Group",
          },
        ],
        events: [],
        replies: [],
      },
    ],
    tasks: [],
    events: [],
    replies: [],
    usage: null,
  } as MsDayMailAnalysis;

  const out = attachExistingTasksToAnalysis(analysis, catalog);
  assert.equal(out.clusters[0]?.tasks[0]?.existingTask?.id, "1");
  assert.equal(out.tasks[0]?.existingTask?.status, "open");
});
