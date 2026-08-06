/**
 * Swiss / European hockey clubs seen on the Ambri-Piotta calendar.
 * Prefer curated Wikimedia logo URLs (official club marks hosted there).
 * Wikipedia page titles are a fallback when no direct URL is known.
 */

export type HockeyTeam = {
  key: string;
  label: string;
  /** Direct Wikimedia / Wikipedia file URL of the official club mark. */
  logoSourceUrl: string | null;
  /** English/German Wikipedia page title for API fallback. */
  wikipediaTitle: string | null;
  aliases: string[];
};

export const HOME_TEAM_KEY = "hc-ambri-piotta";

export const HOCKEY_TEAMS: HockeyTeam[] = [
  {
    key: "hc-ambri-piotta",
    label: "HC Ambri-Piotta",
    logoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/HC_Ambr%C3%AC-Piotta_svg_logo.svg/500px-HC_Ambr%C3%AC-Piotta_svg_logo.svg.png",
    wikipediaTitle: "HC Ambrì-Piotta",
    aliases: ["hc ambri-piotta", "hc ambri piotta", "ambri-piotta", "ambri"],
  },
  {
    key: "hc-davos",
    label: "HC Davos",
    logoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/0/04/HC_Davos_logo.svg/500px-HC_Davos_logo.svg.png",
    wikipediaTitle: "HC Davos",
    aliases: ["hc davos", "davos", "hcd"],
  },
  {
    key: "zsc-lions",
    label: "ZSC Lions",
    logoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/f/f9/ZSC_Lions_logo.svg/500px-ZSC_Lions_logo.svg.png",
    wikipediaTitle: "ZSC Lions",
    aliases: ["zsc lions", "zsc", "zürich", "zurich lions"],
  },
  {
    key: "sc-bern",
    label: "SC Bern",
    logoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/7/70/SC_Bern_logo.svg/500px-SC_Bern_logo.svg.png",
    wikipediaTitle: "SC Bern",
    aliases: ["sc bern", "scb", "bern"],
  },
  {
    key: "ev-zug",
    label: "EV Zug",
    logoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/c/cc/EV_Zug_logo.svg/500px-EV_Zug_logo.svg.png",
    wikipediaTitle: "EV Zug",
    aliases: ["ev zug", "evz", "zug"],
  },
  {
    key: "lausanne-hc",
    label: "Lausanne HC",
    logoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Lausanne_HC_logo.svg/500px-Lausanne_HC_logo.svg.png",
    wikipediaTitle: "Lausanne HC",
    aliases: ["lausanne hc", "lhc", "lausanne"],
  },
  {
    key: "geneve-servette",
    label: "Genève-Servette HC",
    logoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/4/4a/Gen%C3%A8ve-Servette_HC_logo.svg/500px-Gen%C3%A8ve-Servette_HC_logo.svg.png",
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
    logoSourceUrl: "https://image.pngaaa.com/993/5487993-middle.png",
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
    logoSourceUrl:
      "https://p7.hiclipart.com/preview/489/520/904/tissot-arena-ehc-biel-national-league-eisstadion-biel-hc-red-ice-others.jpg",
    wikipediaTitle: "EHC Biel",
    aliases: ["ehc biel-bienne", "ehc biel", "biel-bienne", "biel"],
  },
  {
    key: "ehc-kloten",
    label: "EHC Kloten",
    logoSourceUrl:
      "https://planetehockey.com/wp-content/uploads/2023/03/logo-HC-Kloten.png",
    wikipediaTitle: "EHC Kloten",
    aliases: ["ehc kloten", "kloten", "kloten flyers"],
  },
  {
    key: "hc-lugano",
    label: "HC Lugano",
    logoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/commons/e/e9/HCL_Black_Logo_No_BG.png",
    wikipediaTitle: "HC Lugano",
    aliases: ["hc lugano", "lugano", "hcl"],
  },
  {
    key: "scl-tigers",
    label: "SCL Tigers",
    logoSourceUrl: "https://image.pngaaa.com/743/1148743-middle.png",
    wikipediaTitle: "SCL Tigers",
    aliases: ["scl tigers", "langnau", "tigers"],
  },
  {
    key: "sc-rapperswil",
    label: "SC Rapperswil-Jona Lakers",
    logoSourceUrl:
      "https://backend.soul.media/sites/default/files/2025-09/lakers.png",
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
    logoSourceUrl:
      "https://www.eishockey.net/admin/files/pictures/42204/42204_29211_900_ajoie.png",
    wikipediaTitle: "HC Ajoie",
    aliases: ["hc ajoie", "ajoie"],
  },
  {
    key: "ehc-visp",
    label: "EHC Visp",
    logoSourceUrl:
      "https://www.eishockey.net/admin/files/pictures/42211/42211_35948_800_ehc_visp-logo-wbm-rgb.png",
    wikipediaTitle: "EHC Visp",
    aliases: ["ehc visp", "visp"],
  },
  {
    key: "gdt-bellinzona",
    label: "GDT Bellinzona Snakes",
    // Current Snakes mark is not on Wikimedia; previous Rockets crest as stopgap.
    logoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/en/9/93/HCB_Ticino_Rockets_logo.png",
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
    logoSourceUrl:
      "https://cdn.imgbin.com/17/23/17/imgbin-logo-schwenninger-wild-wings-brand-product-design-transparent-buffalo-wild-wings-logo-aX7wyfyfxnf0hwHUSJhgLc2Ya.jpg",
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
    logoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/en/5/51/2021_Belfast_Giants_logo.png",
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
  logoSourceUrl: string | null;
} {
  const text = String(raw || "").trim();
  if (!text) {
    return {
      key: "unbekannt",
      label: "Unbekannt",
      wikipediaTitle: null,
      logoSourceUrl: null,
    };
  }
  const norm = normalizeTeamText(text);
  for (const team of HOCKEY_TEAMS) {
    const candidates = [team.label, ...team.aliases].map(normalizeTeamText);
    if (candidates.includes(norm)) {
      return {
        key: team.key,
        label: team.label,
        wikipediaTitle: team.wikipediaTitle,
        logoSourceUrl: team.logoSourceUrl,
      };
    }
  }
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
        logoSourceUrl: row.team.logoSourceUrl,
      };
    }
  }
  const slug =
    normalizeTeamText(text).replace(/\s+/g, "-").slice(0, 48) || "unbekannt";
  return {
    key: slug,
    label: text,
    wikipediaTitle: null,
    logoSourceUrl: null,
  };
}

export function hockeyTeamLogoUrl(key: string): string {
  return `/api/hockey/logo/${encodeURIComponent(key)}`;
}

export function hockeyTeamByKey(key: string): HockeyTeam | null {
  return HOCKEY_TEAMS.find((t) => t.key === key) || null;
}
