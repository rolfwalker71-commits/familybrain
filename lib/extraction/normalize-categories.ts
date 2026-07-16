/**
 * Semantic category normalization for travel, finance, deadlines, knowledge.
 * Used on save (new analyses) and on read/aggregation (existing data).
 * Unknown values are mapped ad-hoc via keyword rules, else "Sonstiges".
 */

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

function includesAny(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(n));
}

/* ─── Travel ─────────────────────────────────────────────────────────── */

export const TRAVEL_TYPES = [
  "Flug",
  "Kreuzfahrt",
  "Hotel",
  "Bahn",
  "Mietwagen",
  "Transfer",
  "Parking",
  "Visa / Einreise",
  "Pauschalreise / Urlaub",
  "Reiseversicherung",
  "Sonstiges",
] as const;

export type TravelTypeCanonical = (typeof TRAVEL_TYPES)[number];

const TRAVEL_EXACT: Record<string, TravelTypeCanonical> = {
  flug: "Flug",
  flight: "Flug",
  flights: "Flug",
  airline: "Flug",
  kreuzfahrt: "Kreuzfahrt",
  cruise: "Kreuzfahrt",
  cruises: "Kreuzfahrt",
  hotel: "Hotel",
  hotels: "Hotel",
  hotelaufenthalt: "Hotel",
  accommodation: "Hotel",
  unterkunft: "Hotel",
  zugfahrt: "Bahn",
  zug: "Bahn",
  bahn: "Bahn",
  train: "Bahn",
  rail: "Bahn",
  mietwagen: "Mietwagen",
  rental: "Mietwagen",
  "rental car": "Mietwagen",
  "rental_car": "Mietwagen",
  car: "Mietwagen",
  transfer: "Transfer",
  shuttle: "Transfer",
  parking: "Parking",
  parkplatz: "Parking",
  "visa waiver program": "Visa / Einreise",
  visa: "Visa / Einreise",
  einreise: "Visa / Einreise",
  international: "Visa / Einreise",
  urlaub: "Pauschalreise / Urlaub",
  pauschalreise: "Pauschalreise / Urlaub",
  package: "Pauschalreise / Urlaub",
  paket: "Pauschalreise / Urlaub",
  insurance: "Reiseversicherung",
  reiseversicherung: "Reiseversicherung",
  other: "Sonstiges",
  sonstiges: "Sonstiges",
};

export function normalizeTravelType(
  raw: string | null | undefined
): TravelTypeCanonical {
  const key = fold(raw);
  if (!key) return "Sonstiges";
  if (TRAVEL_EXACT[key]) return TRAVEL_EXACT[key];

  if (includesAny(key, ["cruise", "kreuzfahrt", "schiff"])) return "Kreuzfahrt";
  if (includesAny(key, ["flight", "flug", "airline", "airport"])) return "Flug";
  if (includesAny(key, ["hotel", "unterkunft", "accommodation", "resort"]))
    return "Hotel";
  if (includesAny(key, ["train", "bahn", "zug", "rail", "sbb"])) return "Bahn";
  if (includesAny(key, ["mietwagen", "rental", "car hire", "hertz", "sixt"]))
    return "Mietwagen";
  if (includesAny(key, ["transfer", "shuttle", "taxi"])) return "Transfer";
  if (includesAny(key, ["parking", "parkplatz", "parkhaus"])) return "Parking";
  if (includesAny(key, ["visa", "einreise", "passport", "esta", "schengen"]))
    return "Visa / Einreise";
  if (includesAny(key, ["urlaub", "package", "pauschal", "ferien"]))
    return "Pauschalreise / Urlaub";
  if (includesAny(key, ["versicherung", "insurance"]))
    return "Reiseversicherung";

  return "Sonstiges";
}

/* ─── Deadlines ───────────────────────────────────────────────────────── */

export const DEADLINE_TYPES = [
  "Kündigung",
  "Zahlung",
  "Einsprache",
  "Information",
  "Umtausch",
  "Garantie",
  "Frist",
  "Sonstiges",
] as const;

export type DeadlineTypeCanonical = (typeof DEADLINE_TYPES)[number];

const DEADLINE_EXACT: Record<string, DeadlineTypeCanonical> = {
  cancellation: "Kündigung",
  kundigung: "Kündigung",
  kuendigung: "Kündigung",
  notice: "Kündigung",
  payment: "Zahlung",
  zahlung: "Zahlung",
  due: "Zahlung",
  einsprache: "Einsprache",
  einspruch: "Einsprache",
  opposition: "Einsprache",
  appeal: "Einsprache",
  notification: "Information",
  information: "Information",
  info: "Information",
  exchange: "Umtausch",
  umtausch: "Umtausch",
  warranty: "Garantie",
  garantie: "Garantie",
  notice_period: "Frist",
  frist: "Frist",
  other: "Sonstiges",
  sonstiges: "Sonstiges",
};

export function normalizeDeadlineType(
  raw: string | null | undefined
): DeadlineTypeCanonical {
  const key = fold(raw);
  if (!key) return "Sonstiges";
  if (DEADLINE_EXACT[key]) return DEADLINE_EXACT[key];

  if (includesAny(key, ["kundig", "cancel", "notice", "storno"]))
    return "Kündigung";
  if (includesAny(key, ["zahlung", "payment", "due", "invoice", "rechnung"]))
    return "Zahlung";
  if (includesAny(key, ["einsprach", "einspruch", "appeal", "opposition"]))
    return "Einsprache";
  if (includesAny(key, ["umtausch", "exchange", "wechsel"])) return "Umtausch";
  if (includesAny(key, ["garantie", "warranty"])) return "Garantie";
  if (includesAny(key, ["info", "notif", "mitteil"])) return "Information";

  return "Sonstiges";
}

/* ─── Knowledge areas ─────────────────────────────────────────────────── */

export const KNOWLEDGE_CANONICAL = [
  "Gesundheit",
  "Versicherungen",
  "Wohnen",
  "Steuern",
  "Finanzen",
  "Reisen",
  "Fahrzeuge",
  "Arbeit",
  "Geräte & Garantien",
  "Verträge",
  "Kinder / Familie",
  "Behörden",
  "Ausbildung",
  "Sonstiges",
] as const;

export type KnowledgeCanonical = (typeof KNOWLEDGE_CANONICAL)[number];

const KNOWLEDGE_EXACT: Record<string, KnowledgeCanonical> = {
  gesundheit: "Gesundheit",
  health: "Gesundheit",
  medical: "Gesundheit",
  versicherungen: "Versicherungen",
  versicherung: "Versicherungen",
  insurance: "Versicherungen",
  wohnen: "Wohnen",
  housing: "Wohnen",
  steuern: "Steuern",
  tax: "Steuern",
  taxes: "Steuern",
  finanzen: "Finanzen",
  finance: "Finanzen",
  financial: "Finanzen",
  reisen: "Reisen",
  travel: "Reisen",
  fahrzeuge: "Fahrzeuge",
  vehicle: "Fahrzeuge",
  vehicles: "Fahrzeuge",
  auto: "Fahrzeuge",
  arbeit: "Arbeit",
  work: "Arbeit",
  employment: "Arbeit",
  "gerate & garantien": "Geräte & Garantien",
  "gerate und garantien": "Geräte & Garantien",
  devices: "Geräte & Garantien",
  warranty: "Geräte & Garantien",
  warranties: "Geräte & Garantien",
  vertrage: "Verträge",
  contract: "Verträge",
  contracts: "Verträge",
  "kinder familie": "Kinder / Familie",
  "kinder / familie": "Kinder / Familie",
  family: "Kinder / Familie",
  behorden: "Behörden",
  authority: "Behörden",
  government: "Behörden",
  ausbildung: "Ausbildung",
  education: "Ausbildung",
  sonstiges: "Sonstiges",
  other: "Sonstiges",
  misc: "Sonstiges",
};

export function normalizeKnowledgeCategory(
  raw: string | null | undefined
): KnowledgeCanonical {
  const key = fold(raw);
  if (!key) return "Sonstiges";
  if (KNOWLEDGE_EXACT[key]) return KNOWLEDGE_EXACT[key];

  if (includesAny(key, ["gesund", "arzt", "medik", "health"])) return "Gesundheit";
  if (includesAny(key, ["versicher", "insurance", "police"]))
    return "Versicherungen";
  if (includesAny(key, ["wohn", "miete", "nebenkost", "liegensch"]))
    return "Wohnen";
  if (includesAny(key, ["steuer", "tax"])) return "Steuern";
  if (includesAny(key, ["reise", "travel", "flug", "hotel", "cruise"]))
    return "Reisen";
  if (includesAny(key, ["fahrzeug", "auto", "motorrad", "vehicle"]))
    return "Fahrzeuge";
  if (includesAny(key, ["arbeit", "lohn", "gehalt", "employ"])) return "Arbeit";
  if (includesAny(key, ["gerat", "garantie", "warranty", "device", "serial"]))
    return "Geräte & Garantien";
  if (includesAny(key, ["vertrag", "contract", "kundig"])) return "Verträge";
  if (includesAny(key, ["kind", "familie", "schule", "family"]))
    return "Kinder / Familie";
  if (includesAny(key, ["behorde", "amt", "ausweis", "government"]))
    return "Behörden";
  if (includesAny(key, ["ausbild", "diplom", "zeugnis", "educat"]))
    return "Ausbildung";
  if (includesAny(key, ["finanz", "rechnung", "konto", "zahlung", "invoice"]))
    return "Finanzen";

  return "Sonstiges";
}

/* ─── Finance: synonym + display bucket ───────────────────────────────── */

export const FINANCE_BUCKETS = [
  "Lohn & Sozialversicherungen",
  "Steuern",
  "Versicherungen",
  "Gesundheit",
  "Wohnen & Energie",
  "IT / Telecom / Abos",
  "Einkauf & Rechnungen",
  "Kreditkarte",
  "Zinsen & Kapital",
  "Reisen",
  "Saldo / Konto",
  "Finanzen / Gebühren",
  "Sonstiges",
] as const;

export type FinanceBucket = (typeof FINANCE_BUCKETS)[number];

/** Synonym → short canonical label (layer A). */
export function normalizeFinanceCategory(
  raw: string | null | undefined
): string {
  const key = fold(raw);
  if (!key) return "Sonstiges";

  if (
    includesAny(key, [
      "nettolohn",
      "bruttolohn",
      "bruttogehalt",
      "jahreslohn",
      "lohn",
      "gehalt",
      "salary",
      "ahv",
      "alv",
      "bvg",
      "sozialversicher",
      "versicherter lohn",
      "einkunfte aus unselbst",
      "homeoffice",
      "pauschale internetanschluss",
    ])
  ) {
    return "Lohn";
  }
  if (
    includesAny(key, [
      "steuer",
      "tax",
      "verrechnungssteuer",
      "stempelabgabe",
      "nettomsteuer",
      "netto-steuerschuld",
    ])
  ) {
    return "Steuern";
  }
  if (
    includesAny(key, [
      "versicherung",
      "pramie",
      "jahrespramie",
      "monatspramie",
      "police",
      "insurance",
    ])
  ) {
    return "Versicherungen";
  }
  if (
    includesAny(key, [
      "gesundheit",
      "gesundheitskosten",
      "krankheit",
      "unfallkosten",
      "arzt",
      "medikament",
    ])
  ) {
    return "Gesundheit";
  }
  if (
    includesAny(key, [
      "energie",
      "strom",
      "gas",
      "wasser",
      "heizung",
      "nebenkost",
      "miete",
      "wohnen",
    ])
  ) {
    return "Wohnen & Energie";
  }
  if (
    includesAny(key, [
      "internet",
      "telecom",
      "telekom",
      "hosting",
      "domain",
      "software",
      "google workspace",
      "abonnement",
      "abo",
      "digitalprodukt",
      "netzwerk",
      "webhosting",
    ])
  ) {
    return "IT / Telecom";
  }
  if (
    includesAny(key, [
      "kreditkarte",
      "credit card",
      "cumulus",
      "visa karte",
      "mastercard",
    ])
  ) {
    return "Kreditkarte";
  }
  if (
    includesAny(key, [
      "zins",
      "haben",
      "sollzins",
      "kapital",
      "altersguthaben",
      "rente",
      "vermog",
      "liegenschaft",
      "kaufpreis",
      "todesfall",
      "vorbezug",
    ])
  ) {
    return "Zinsen & Kapital";
  }
  if (includesAny(key, ["reise", "flug", "hotel", "travel", "cruise"])) {
    return "Reisen";
  }
  if (
    includesAny(key, [
      "saldo",
      "buchsaldo",
      "guthaben",
      "gesamtbetrag",
      "total abzug",
      "total der abzug",
      "total guthaben",
      "total kosten",
      "total jahresbeitrag",
      "total alters",
      "zahlung esr",
      "konto",
    ])
  ) {
    return "Saldo / Konto";
  }
  if (
    includesAny(key, [
      "rechnung",
      "einkauf",
      "kauf",
      "dienstleistung",
      "invoice",
      "beleg",
    ])
  ) {
    return "Einkauf / Rechnung";
  }
  if (
    includesAny(key, [
      "gebühr",
      "gebuhr",
      "kontogebuhr",
      "eroffnungsgebuhr",
      "mitgliederbeitrag",
      "finanz",
    ])
  ) {
    return "Finanzen / Gebühren";
  }

  // Keep a readable trimmed original if unknown (ad-hoc later via bucket).
  const trimmed = (raw || "").trim();
  return trimmed || "Sonstiges";
}

/** Display bucket for finance overview tiles (layer B). */
export function financeBucket(raw: string | null | undefined): FinanceBucket {
  const syn = fold(normalizeFinanceCategory(raw));
  const key = fold(raw);

  if (
    includesAny(syn, ["lohn"]) ||
    includesAny(key, [
      "lohn",
      "gehalt",
      "ahv",
      "alv",
      "bvg",
      "sozial",
      "salary",
      "homeoffice",
    ])
  ) {
    return "Lohn & Sozialversicherungen";
  }
  if (includesAny(syn, ["steuer"]) || includesAny(key, ["steuer", "tax"])) {
    return "Steuern";
  }
  if (
    includesAny(syn, ["versicherung"]) ||
    includesAny(key, ["versicherung", "pramie", "police", "insurance"])
  ) {
    return "Versicherungen";
  }
  if (
    includesAny(syn, ["gesundheit"]) ||
    includesAny(key, ["gesundheit", "krankheit", "arzt"])
  ) {
    return "Gesundheit";
  }
  if (
    includesAny(syn, ["wohnen", "energie"]) ||
    includesAny(key, ["energie", "strom", "miete", "wohnen", "nebenkost"])
  ) {
    return "Wohnen & Energie";
  }
  if (
    includesAny(syn, ["it", "telecom"]) ||
    includesAny(key, [
      "internet",
      "hosting",
      "domain",
      "software",
      "telecom",
      "abo",
      "google",
    ])
  ) {
    return "IT / Telecom / Abos";
  }
  if (
    includesAny(syn, ["kreditkarte"]) ||
    includesAny(key, ["kreditkarte", "credit card"])
  ) {
    return "Kreditkarte";
  }
  if (
    includesAny(syn, ["zinsen", "kapital"]) ||
    includesAny(key, [
      "zins",
      "kapital",
      "rente",
      "vermog",
      "altersguthaben",
      "liegensch",
    ])
  ) {
    return "Zinsen & Kapital";
  }
  if (includesAny(syn, ["reise"]) || includesAny(key, ["reise", "travel", "flug"])) {
    return "Reisen";
  }
  if (
    includesAny(syn, ["saldo", "konto"]) ||
    includesAny(key, [
      "saldo",
      "buchsaldo",
      "guthaben",
      "total abzug",
      "total der abzug",
      "total guthaben",
      "gesamtbetrag",
      "zahlung esr",
    ])
  ) {
    return "Saldo / Konto";
  }
  if (
    includesAny(syn, ["einkauf", "rechnung"]) ||
    includesAny(key, ["rechnung", "einkauf", "kauf", "dienstleistung"])
  ) {
    return "Einkauf & Rechnungen";
  }
  if (
    includesAny(syn, ["finanz", "gebuhr"]) ||
    includesAny(key, ["gebühr", "gebuhr", "kontogebuhr", "mitglieder"])
  ) {
    return "Finanzen / Gebühren";
  }

  return "Sonstiges";
}

/** Re-aggregate rows by a mapped label. */
export function aggregateByMappedLabel<T extends { count: number; total: number }>(
  rows: T[],
  labelOf: (row: T) => string
): Array<{ label: string; count: number; total: number }> {
  const map = new Map<string, { label: string; count: number; total: number }>();
  for (const row of rows) {
    const label = labelOf(row);
    const prev = map.get(label) || { label, count: 0, total: 0 };
    prev.count += Number(row.count) || 0;
    prev.total += Number(row.total) || 0;
    map.set(label, prev);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
