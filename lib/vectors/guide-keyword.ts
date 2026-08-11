import { getDb } from "@/lib/db/client";
import type { GuideSource } from "@/lib/vectors/types";

const STOPWORDS = new Set([
  "der",
  "die",
  "das",
  "und",
  "oder",
  "mit",
  "für",
  "von",
  "aus",
  "bei",
  "zum",
  "zur",
  "ein",
  "eine",
  "einer",
  "einem",
  "eines",
  "ist",
  "sind",
  "was",
  "wie",
  "wo",
  "wann",
  "wer",
  "welche",
  "welcher",
  "welches",
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "about",
  "bitte",
  "etwas",
  "denn",
  "doch",
  "also",
  "dann",
  "man",
]);

/**
 * Tokenize for guide keyword search. Keeps short identifiers like «SP» + «2605».
 */
export function tokenizeGuideQuery(query: string): string[] {
  const lower = query.toLowerCase().normalize("NFC");
  const out: string[] = [];

  for (const m of lower.matchAll(/\b([a-z]{1,5})\s*[-_]?\s*(\d{3,6})\b/g)) {
    out.push(m[1], m[2], `${m[1]}${m[2]}`);
  }

  for (const raw of lower.split(/[^a-z0-9äöüàéèêâôûïß]+/i)) {
    const t = raw.trim();
    if (!t || STOPWORDS.has(t)) continue;
    if (t.length >= 3) {
      out.push(t);
      continue;
    }
    if (/^\d{2,}$/.test(t) || /^[a-z]{2}$/.test(t)) {
      out.push(t);
    }
  }

  return [...new Set(out)].slice(0, 16);
}

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "");
}

function scoreChunk(
  title: string,
  filename: string,
  text: string,
  tokens: string[]
): number {
  const hay = `${title}\n${filename}\n${text}`.toLowerCase();
  let score = 0;
  let hits = 0;
  for (const token of tokens) {
    if (!token || !hay.includes(token)) continue;
    hits += 1;
    const inTitle =
      title.toLowerCase().includes(token) ||
      filename.toLowerCase().includes(token);
    // Prefer exact identifier hits and title matches.
    const weight = /^\d{3,}$/.test(token) || /^[a-z]{1,5}\d{3,}$/.test(token)
      ? 8
      : token.length <= 2
        ? 5
        : 3;
    score += weight + (inTitle ? 4 : 0);
    if (hay.includes(` ${token} `) || hay.startsWith(`${token} `)) {
      score += 1;
    }
  }
  if (hits === 0) return 0;
  // Require at least one hit; boost multi-token overlap.
  score += Math.min(6, hits * 2);
  return score;
}

type ChunkRow = {
  guide_id: number;
  chunk_index: number;
  page_start: number | null;
  page_end: number | null;
  chunk_text: string;
  title: string;
  filename: string;
};

/**
 * Keyword / LIKE retrieval over indexed guide chunks (complements semantic search).
 * Scores are in a keyword-ish range (~5–40), not cosine similarity.
 */
export function retrieveGuidesByKeyword(
  question: string,
  limit = 12
): GuideSource[] {
  const tokens = tokenizeGuideQuery(question)
    .map(escapeLike)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return [];

  const db = getDb();
  const searchTokens = tokens.slice(0, 10);
  const clauses = searchTokens
    .map(
      () =>
        `(LOWER(c.chunk_text) LIKE ? OR LOWER(g.title) LIKE ? OR LOWER(COALESCE(g.filename, '')) LIKE ?)`
    )
    .join(" OR ");
  const params = searchTokens.flatMap((t) => {
    const like = `%${t}%`;
    return [like, like, like];
  });

  const rows = db
    .prepare(
      `SELECT c.guide_id, c.chunk_index, c.page_start, c.page_end, c.chunk_text,
              g.title, g.filename
       FROM knowledge_guide_chunks c
       JOIN knowledge_guides g ON g.id = c.guide_id
       WHERE g.embedding_status = 'indexed'
         AND (${clauses})
       LIMIT 120`
    )
    .all(...params) as ChunkRow[];

  const scored: GuideSource[] = [];
  for (const row of rows) {
    const score = scoreChunk(
      row.title || "",
      row.filename || "",
      row.chunk_text || "",
      tokens
    );
    if (score <= 0) continue;
    scored.push({
      kind: "guide",
      id: row.guide_id,
      title: row.title || "Guide",
      excerpt: row.chunk_text,
      score,
      pageStart: row.page_start,
      pageEnd: row.page_end,
      chunkIndex: row.chunk_index,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
