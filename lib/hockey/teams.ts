/**
 * Swiss / European hockey clubs seen on the Ambri-Piotta calendar.
 * Wikipedia page titles resolve to official club marks via the REST summary API.
 */

export type HockeyTeam = {
  key: string;
  label: string;
  /** English Wikipedia page title (spaces ok). */
  wikipediaTitle: string | null;
  aliases: string[];
};

export const HOME_TEAM_KEY = "hc-ambri-piotta";

export const HOCKEY_TEAMS: HockeyTeam[] = [
  {
    key: "hc-ambri-piotta",
    label: "HC Ambri-Piotta",
    wikipediaTitle: "HC Ambrì-Piotta",
    aliases: ["hc ambri-piotta", "hc ambri piotta", "ambri-piotta", "ambri"],
  },
  {
    key: "hc-davos",
    label: "HC Davos",
    wikipediaTitle: "HC Davos",
    aliases: ["hc davos", "davos", "hcd"],
  },
  {
    key: "zsc-lions",
    label: "ZSC Lions",
    wikipediaTitle: "ZSC Lions",
    aliases: ["zsc lions", "zsc", "zürich", "zurich lions"],
  },
  {
    key: "sc-bern",
    label: "SC Bern",
    wikipediaTitle: "SC Bern",
    aliases: ["sc bern", "scb", "bern"],
  },
  {
    key: "ev-zug",
    label: "EV Zug",
    wikipediaTitle: "EV Zug",
    aliases: ["ev zug", "evz", "zug"],
  },
  {
    key: "lausanne-hc",
    label: "Lausanne HC",
    wikipediaTitle: "Lausanne HC",
    aliases: ["lausanne hc", "lhc", "lausanne"],
  },
  {
    key: "geneve-servette",
    label: "Genève-Servette HC",
    wikipediaTitle: "Genève-Servette HC",
    aliases: [
      "genève-servette hc",
      "geneve-servette hc",
      "genève-servette",
      "geneve-servette",
      "gshc",
      "servette",
    ],
  },
  {
    key: "fribourg-gotteron",
    label: "Fribourg-Gottéron",
    wikipediaTitle: "Fribourg-Gottéron",
    aliases: [
      "fribourg-gottéron",
      "fribourg-gotteron",
      "hc fribourg-gottéron",
      "gotteron",
      "gottéron",
    ],
  },
  {
    key: "ehc-biel",
    label: "EHC Biel-Bienne",
    wikipediaTitle: "EHC Biel",
    aliases: ["ehc biel-bienne", "ehc biel", "biel-bienne", "biel"],
  },
  {
    key: "ehc-kloten",
    label: "EHC Kloten",
    wikipediaTitle: "EHC Kloten",
    aliases: ["ehc kloten", "kloten", "kloten flyers"],
  },
  {
    key: "hc-lugano",
    label: "HC Lugano",
    wikipediaTitle: "HC Lugano",
    aliases: ["hc lugano", "lugano", "hcl"],
  },
  {
    key: "scl-tigers",
    label: "SCL Tigers",
    wikipediaTitle: "SCL Tigers",
    aliases: ["scl tigers", "langnau", "tigers"],
  },
  {
    key: "sc-rapperswil",
    label: "SC Rapperswil-Jona Lakers",
    wikipediaTitle: "Rapperswil-Jona Lakers",
    aliases: [
      "sc rapperswil-jona lakers",
      "rapperswil-jona lakers",
      "rapperswil",
      "lakers",
      "scrj",
    ],
  },
  {
    key: "hc-ajoie",
    label: "HC Ajoie",
    wikipediaTitle: "HC Ajoie",
    aliases: ["hc ajoie", "ajoie"],
  },
  {
    key: "ehc-visp",
    label: "EHC Visp",
    wikipediaTitle: "EHC Visp",
    aliases: ["ehc visp", "visp"],
  },
  {
    key: "gdt-bellinzona",
    label: "GDT Bellinzona Snakes",
    wikipediaTitle: "GDT Bellinzona Snakes",
    aliases: [
      "gdt bellinzona snakes",
      "bellinzona snakes",
      "bellinzona",
      "snakes",
    ],
  },
  {
    key: "schwenninger-wild-wings",
    label: "Schwenninger Wild Wings",
    wikipediaTitle: "Schwenninger Wild Wings",
    aliases: [
      "schwenninger wild wings",
      "schwenningen",
      "wild wings",
      "serw",
    ],
  },
  {
    key: "belfast-giants",
    label: "Belfast Giants",
    wikipediaTitle: "Belfast Giants",
    aliases: ["belfast giants", "belfast", "giants"],
  },
];

function normalizeTeamText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveHockeyTeam(raw: string | null | undefined): {
  key: string;
  label: string;
  wikipediaTitle: string | null;
} {
  const text = String(raw || "").trim();
  if (!text) {
    return { key: "unbekannt", label: "Unbekannt", wikipediaTitle: null };
  }
  const norm = normalizeTeamText(text);
  for (const team of HOCKEY_TEAMS) {
    const candidates = [team.label, ...team.aliases].map(normalizeTeamText);
    if (candidates.includes(norm)) {
      return {
        key: team.key,
        label: team.label,
        wikipediaTitle: team.wikipediaTitle,
      };
    }
  }
  // Partial contains match for longer aliases first
  const ranked = HOCKEY_TEAMS.flatMap((team) =>
    [team.label, ...team.aliases].map((alias) => ({
      team,
      alias: normalizeTeamText(alias),
    }))
  ).sort((a, b) => b.alias.length - a.alias.length);
  for (const row of ranked) {
    if (row.alias.length >= 4 && norm.includes(row.alias)) {
      return {
        key: row.team.key,
        label: row.team.label,
        wikipediaTitle: row.team.wikipediaTitle,
      };
    }
  }
  const slug =
    normalizeTeamText(text).replace(/\s+/g, "-").slice(0, 48) || "unbekannt";
  return { key: slug, label: text, wikipediaTitle: null };
}

export function hockeyTeamLogoUrl(key: string): string {
  return `/api/hockey/logo/${encodeURIComponent(key)}`;
}
