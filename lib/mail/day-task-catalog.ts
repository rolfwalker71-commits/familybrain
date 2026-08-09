import type {
  ExistingDayTaskRef,
  MsDayMailAnalysis,
  MsDayTaskSuggestion,
} from "@/lib/microsoft/analyze-mail-day";
import { stripTrailingSenderSuffix } from "@/lib/microsoft/analyze-mail-day";

export type { ExistingDayTaskRef };

/** Bestehende Aufgabe aus Google Tasks / Outlook To Do / Planner. */
export type DayTaskCatalogItem = {
  id: string;
  title: string;
  notes: string | null;
  status: "open" | "done";
  doneAt: string | null;
  href: string | null;
  source?: "todo" | "planner" | "google";
};

const STOP = new Set([
  "der",
  "die",
  "das",
  "und",
  "oder",
  "für",
  "mit",
  "von",
  "zum",
  "zur",
  "eine",
  "einer",
  "eines",
  "einem",
  "den",
  "dem",
  "des",
  "ein",
  "auf",
  "an",
  "im",
  "in",
  "am",
  "bei",
  "nach",
  "aus",
  "über",
  "ueber",
  "bitte",
  "noch",
  "auch",
  "the",
  "and",
  "for",
  "with",
  "from",
  "to",
  "a",
  "an",
  "of",
  "task",
  "aufgabe",
  "mail",
  "email",
  "antwort",
]);

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\u00df/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9äöü\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function tokenSet(s: string): Set<string> {
  return new Set(tokens(s));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

function suggestionCoreTitle(title: string): string {
  return stripTrailingSenderSuffix(title);
}

type Scored = {
  item: DayTaskCatalogItem;
  score: number;
  match: ExistingDayTaskRef["match"];
};

function scoreCatalogAgainstSuggestion(
  item: DayTaskCatalogItem,
  suggestion: MsDayTaskSuggestion
): Scored | null {
  const sugTitle = suggestionCoreTitle(suggestion.title || "");
  const sugTitleNorm = normalizeText(sugTitle);
  const catTitleNorm = normalizeText(item.title || "");
  if (!sugTitleNorm || !catTitleNorm) return null;

  const sugTitleTok = tokenSet(sugTitle);
  const catTitleTok = tokenSet(item.title);
  const catAllTok = tokenSet(`${item.title} ${item.notes || ""}`);
  const themeTok = tokenSet(
    [suggestion.theme, suggestion.company].filter(Boolean).join(" ")
  );

  let score = 0;
  let match: ExistingDayTaskRef["match"] = "title";

  if (sugTitleNorm === catTitleNorm) {
    score = 1;
    match = "title";
  } else if (
    sugTitleNorm.includes(catTitleNorm) ||
    catTitleNorm.includes(sugTitleNorm)
  ) {
    score = 0.92;
    match = "title";
  } else {
    const titleJac = jaccard(sugTitleTok, catTitleTok);
    const titleOverlap = overlapCount(sugTitleTok, catTitleTok);
    score = titleJac * 0.85 + Math.min(1, titleOverlap / 3) * 0.15;
    match = "title";

    if (themeTok.size > 0) {
      const themeInCat = overlapCount(themeTok, catAllTok);
      const themeScore =
        themeInCat / Math.max(1, Math.min(themeTok.size, 4));
      if (themeScore >= 0.5 && themeScore > score) {
        score = Math.max(score, 0.55 + themeScore * 0.35);
        match = "theme";
      } else if (themeScore >= 0.5) {
        score = Math.min(1, score + 0.12);
      }
    }

    if (item.notes) {
      const notesTok = tokenSet(item.notes);
      const notesOverlap = overlapCount(sugTitleTok, notesTok);
      if (notesOverlap >= 2) {
        const bump = Math.min(0.2, notesOverlap * 0.06);
        if (score + bump > score) {
          score = Math.min(1, score + bump);
          if (score < 0.75) match = "notes";
        }
      }
    }
  }

  // Prefer open slightly when scores are close — caller handles uniqueness.
  if (item.status === "open") score += 0.02;

  if (score < 0.58) return null;
  return { item, score, match };
}

export function matchExistingDayTask(
  suggestion: MsDayTaskSuggestion,
  catalog: DayTaskCatalogItem[],
  usedIds?: Set<string>
): ExistingDayTaskRef | null {
  let best: Scored | null = null;
  for (const item of catalog) {
    if (usedIds?.has(item.id)) continue;
    const scored = scoreCatalogAgainstSuggestion(item, suggestion);
    if (!scored) continue;
    if (
      !best ||
      scored.score > best.score ||
      (scored.score === best.score &&
        scored.item.status === "done" &&
        best.item.status === "open")
    ) {
      // Prefer higher score; on tie prefer done (already settled) only if equal?
      // Actually: on tie prefer open so user still sees open work first.
      // Override: if scores within 0.03 and one is done matching same theme, pick higher raw.
      best = scored;
    }
  }
  if (!best) return null;
  return {
    id: best.item.id,
    title: best.item.title,
    status: best.item.status,
    doneAt: best.item.doneAt,
    href: best.item.href,
    match: best.match,
    source: best.item.source || null,
  };
}

/** Reichert Analyse-Tasks mit Treffern aus To Do / Planner / Google Tasks an. */
export function attachExistingTasksToAnalysis(
  analysis: MsDayMailAnalysis,
  catalog: DayTaskCatalogItem[]
): MsDayMailAnalysis {
  if (!catalog.length) return analysis;
  const used = new Set<string>();

  const enrichTask = (t: MsDayTaskSuggestion): MsDayTaskSuggestion => {
    const hit = matchExistingDayTask(t, catalog, used);
    if (!hit) return { ...t, existingTask: null };
    used.add(hit.id);
    return { ...t, existingTask: hit };
  };

  const clusters = (analysis.clusters || []).map((c) => ({
    ...c,
    tasks: (c.tasks || []).map(enrichTask),
  }));
  const tasks = clusters.flatMap((c) => c.tasks);

  return {
    ...analysis,
    clusters,
    tasks,
  };
}
