import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import {
  TRAVEL_TYPES,
  type TravelTypeCanonical,
  type TravelTypeContext,
  normalizeTravelType,
} from "@/lib/extraction/normalize-categories";

export type ClassificationDomain = "travel_type";

export type ClassificationRule = {
  id: number;
  domain: ClassificationDomain;
  match_field: "provider" | "title" | "provider_or_title";
  match_mode: "contains" | "equals";
  match_value: string;
  target_value: string;
  priority: number;
  enabled: number;
  hit_count: number;
  last_hit_at: string | null;
};

function fold(input: string | null | undefined): string {
  return (input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/|+]+/g, " ")
    .replace(/[^a-z0-9äöüß\s.-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldMatches(
  rule: Pick<ClassificationRule, "match_mode" | "match_value">,
  value: string | null | undefined
): boolean {
  const hay = fold(value);
  const needle = fold(rule.match_value);
  if (!hay || !needle) return false;
  if (rule.match_mode === "equals") return hay === needle;
  return hay.includes(needle);
}

function ruleMatchesTravel(
  rule: ClassificationRule,
  ctx: TravelTypeContext
): boolean {
  if (rule.match_field === "provider") {
    return fieldMatches(rule, ctx.provider);
  }
  if (rule.match_field === "title") {
    return fieldMatches(rule, ctx.title);
  }
  return fieldMatches(rule, ctx.provider) || fieldMatches(rule, ctx.title);
}

export function listClassificationRules(
  domain?: ClassificationDomain
): ClassificationRule[] {
  const db = getDb();
  if (domain) {
    return db
      .prepare(
        `SELECT * FROM classification_rules
         WHERE domain = ?
         ORDER BY priority ASC, id ASC`
      )
      .all(domain) as ClassificationRule[];
  }
  return db
    .prepare(
      `SELECT * FROM classification_rules ORDER BY domain, priority ASC, id ASC`
    )
    .all() as ClassificationRule[];
}

export function findTravelTypeRule(
  ctx: TravelTypeContext
): ClassificationRule | null {
  const rules = listClassificationRules("travel_type").filter(
    (r) => r.enabled
  );
  for (const rule of rules) {
    if (ruleMatchesTravel(rule, ctx)) return rule;
  }
  return null;
}

function bumpRuleHit(ruleId: number): void {
  const db = getDb();
  const ts = nowIso();
  db.prepare(
    `UPDATE classification_rules
     SET hit_count = hit_count + 1, last_hit_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(ts, ts, ruleId);
}

/**
 * Resolve display/store travel type:
 * 1) per-item override
 * 2) learned classification rule
 * 3) heuristic normalizeTravelType
 */
export function resolveTravelType(
  raw: string | null | undefined,
  ctx?: TravelTypeContext & { travel_type_override?: string | null },
  opts?: { recordHit?: boolean }
): TravelTypeCanonical {
  const override = ctx?.travel_type_override?.trim();
  if (override && (TRAVEL_TYPES as readonly string[]).includes(override)) {
    return override as TravelTypeCanonical;
  }

  const rule = findTravelTypeRule(ctx || {});
  if (
    rule &&
    (TRAVEL_TYPES as readonly string[]).includes(rule.target_value)
  ) {
    if (opts?.recordHit) bumpRuleHit(rule.id);
    return rule.target_value as TravelTypeCanonical;
  }

  return normalizeTravelType(raw, ctx);
}

export function upsertTravelTypeRule(input: {
  matchField: ClassificationRule["match_field"];
  matchMode?: ClassificationRule["match_mode"];
  matchValue: string;
  targetValue: TravelTypeCanonical;
  priority?: number;
}): ClassificationRule {
  const db = getDb();
  const ts = nowIso();
  const matchMode = input.matchMode || "contains";
  const matchValue = input.matchValue.trim();
  if (!matchValue) {
    throw new Error("match_value fehlt");
  }
  if (!(TRAVEL_TYPES as readonly string[]).includes(input.targetValue)) {
    throw new Error("Ungültiger Ziel-Typ");
  }

  const existing = db
    .prepare(
      `SELECT id FROM classification_rules
       WHERE domain = 'travel_type'
         AND match_field = ?
         AND match_mode = ?
         AND lower(match_value) = lower(?)
       LIMIT 1`
    )
    .get(input.matchField, matchMode, matchValue) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE classification_rules
       SET target_value = ?, priority = ?, enabled = 1, updated_at = ?
       WHERE id = ?`
    ).run(
      input.targetValue,
      input.priority ?? 100,
      ts,
      existing.id
    );
    return db
      .prepare(`SELECT * FROM classification_rules WHERE id = ?`)
      .get(existing.id) as ClassificationRule;
  }

  const result = db
    .prepare(
      `INSERT INTO classification_rules (
        domain, match_field, match_mode, match_value, target_value,
        priority, enabled, hit_count, created_at, updated_at
      ) VALUES ('travel_type', ?, ?, ?, ?, ?, 1, 0, ?, ?)`
    )
    .run(
      input.matchField,
      matchMode,
      matchValue,
      input.targetValue,
      input.priority ?? 100,
      ts,
      ts
    );

  return db
    .prepare(`SELECT * FROM classification_rules WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as ClassificationRule;
}

/** Suggest a learnable match from a travel row. Prefer provider, else title. */
export function suggestTravelLearnMatch(row: {
  provider?: string | null;
  title?: string | null;
}): {
  matchField: ClassificationRule["match_field"];
  matchMode: ClassificationRule["match_mode"];
  matchValue: string;
  label: string;
} | null {
  const provider = row.provider?.trim();
  if (provider && provider.length >= 2 && !/^unbekannt$/i.test(provider)) {
    return {
      matchField: "provider",
      matchMode: "contains",
      matchValue: provider,
      label: `Anbieter enthält «${provider}»`,
    };
  }
  const title = row.title?.trim();
  if (title && title.length >= 4) {
    // Use a stable short phrase from the title (first 2–4 meaningful words).
    const words = title.split(/\s+/).filter((w) => w.length > 2).slice(0, 3);
    const phrase = words.join(" ") || title.slice(0, 40);
    return {
      matchField: "title",
      matchMode: "contains",
      matchValue: phrase,
      label: `Titel enthält «${phrase}»`,
    };
  }
  return null;
}

export function applyTravelTypeRuleToMatchingItems(rule: ClassificationRule): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, travel_type, travel_type_override, provider, title, origin, destination
       FROM travel_items`
    )
    .all() as Array<{
    id: number;
    travel_type: string | null;
    travel_type_override: string | null;
    provider: string | null;
    title: string | null;
    origin: string | null;
    destination: string | null;
  }>;

  const upd = db.prepare(
    `UPDATE travel_items
     SET travel_type = ?, travel_type_override = ?, updated_at = ?
     WHERE id = ?`
  );
  const ts = nowIso();
  let n = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      if (!ruleMatchesTravel(rule, row)) continue;
      // Don't overwrite a different explicit override.
      if (
        row.travel_type_override &&
        row.travel_type_override !== rule.target_value
      ) {
        continue;
      }
      upd.run(rule.target_value, rule.target_value, ts, row.id);
      n++;
    }
  });
  tx();
  return n;
}
