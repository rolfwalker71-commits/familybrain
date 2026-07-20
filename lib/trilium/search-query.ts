const STOPWORDS = new Set([
  "der",
  "die",
  "das",
  "und",
  "oder",
  "ein",
  "eine",
  "einer",
  "einem",
  "einen",
  "ist",
  "sind",
  "was",
  "wie",
  "wo",
  "wann",
  "welche",
  "welcher",
  "welches",
  "habe",
  "haben",
  "hat",
  "für",
  "von",
  "mit",
  "auf",
  "im",
  "in",
  "zu",
  "zum",
  "zur",
  "am",
  "an",
  "den",
  "dem",
  "des",
  "mir",
  "mich",
  "meine",
  "mein",
  "uns",
  "unser",
  "zeige",
  "zeig",
  "gib",
  "bitte",
  "ich",
  "möchte",
  "moete",
  "will",
  "würde",
  "info",
  "infos",
  "information",
  "informationen",
  "thema",
  "über",
  "ueber",
  "alle",
  "alles",
  "gibt",
  "kannst",
  "kann",
  "finde",
  "finden",
  "suche",
  "such",
  "nach",
  "details",
  "detail",
  "dazu",
  "steht",
  "stehen",
  "mir",
  "deine",
  "dein",
  "deinen",
  "deiner",
  "deinem",
  "wissen",
  "wissensbasis",
  "notiz",
  "notizen",
  "trilium",
]);

function escapeSearchQuote(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeSqlQuote(value: string): string {
  return value.replace(/'/g, "''");
}

export function tokenizeQuestionForSearch(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/** Build Trilium search queries from most specific to broad. */
export function buildSearchStrategies(question: string): string[] {
  const strategies: string[] = [];
  const seen = new Set<string>();

  function add(strategy: string) {
    const normalized = strategy.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    strategies.push(normalized);
  }

  for (const match of question.matchAll(/"([^"]+)"/g)) {
    const phrase = match[1].trim();
    if (phrase.length > 2) {
      add(`"${escapeSearchQuote(phrase)}"`);
      add(`note.title *=* '${escapeSqlQuote(phrase)}'`);
    }
  }

  for (const match of question.matchAll(/\(([^)]+)\)/g)) {
    const phrase = match[1].trim();
    if (phrase.length > 2) {
      add(`"${escapeSearchQuote(phrase)}"`);
      add(`note.title *=* '${escapeSqlQuote(phrase)}'`);
    }
  }

  const themaIntro = question.match(
    /(?:infos?\s+)?(?:zu(?:m|r)?\s+)?thema\s+(?:dem|der|das|die|den)?\s*(.+?)(?:[.?!]|$)/iu
  );
  if (themaIntro) {
    const subject = themaIntro[1].trim();
    if (subject.length > 2) {
      add(`"${escapeSearchQuote(subject)}"`);
      add(`note.title *=* '${escapeSqlQuote(subject)}'`);
      const withoutParens = subject.replace(/\([^)]*\)/g, "").trim();
      if (withoutParens.length > 2) {
        add(`"${escapeSearchQuote(withoutParens)}"`);
        add(`note.title *=* '${escapeSqlQuote(withoutParens)}'`);
      }
    }
  }

  const subjectMatch = question.match(
    /(?:über|ueber|wegen|bezüglich|bezueglich)\s+(?:dem|der|das|die|den)?\s*(.+?)(?:[.?!]|$)/iu
  );
  if (subjectMatch) {
    const subject = subjectMatch[1].trim();
    if (subject.length > 2) {
      add(`"${escapeSearchQuote(subject)}"`);
      add(`note.title *=* '${escapeSqlQuote(subject)}'`);
    }
  }

  const tokens = tokenizeQuestionForSearch(question);
  if (tokens.length > 0) {
    const byLength = [...tokens].sort((a, b) => b.length - a.length);

    add(byLength.slice(0, 3).join(" "));
    add(byLength.slice(0, 2).join(" "));

    for (const token of byLength.filter((value) => value.length >= 5).slice(0, 3)) {
      add(token);
      add(`note.title *=* '${escapeSqlQuote(token)}'`);
    }

    add(tokens.slice(0, 5).join(" "));
  }

  return strategies;
}
