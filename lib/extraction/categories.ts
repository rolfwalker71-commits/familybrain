/** Built-in knowledge areas (seeded into knowledge_areas). Custom areas can be added via DB/UI. */
export const KNOWLEDGE_AREAS = [
  { name: "Gesundheit", description: "Arztberichte, Medikamente, Untersuchungen" },
  { name: "Versicherungen", description: "Policen, Prämien, Leistungsabrechnungen" },
  { name: "Wohnen", description: "Miete, Eigentum, Haushalt, Nebenkosten" },
  { name: "Steuern", description: "Steuererklärungen, Veranlagungen, Steuerbelege" },
  {
    name: "Kreditkarten",
    description: "Kreditkartenabrechnungen (Monatsauszüge der Kartenherausgeber)",
  },
  { name: "Finanzen", description: "Rechnungen, Kontobewegungen, Ausgaben" },
  { name: "Reisen", description: "Flüge, Hotels, Tickets, Reiseunterlagen" },
  { name: "Fahrzeuge", description: "Auto, Motorrad, Versicherungen, Service" },
  { name: "Arbeit", description: "Arbeitsvertrag, Lohn, Bewerbungen" },
  {
    name: "Computer",
    description: "Hardware, Software, Lizenzen, IT-Abos",
  },
  { name: "Geräte & Garantien", description: "Kaufbelege, Garantien, Seriennummern" },
  { name: "Verträge", description: "Verträge, Kündigung, Vertragsparteien" },
  { name: "Kinder / Familie", description: "Schule, Betreuung, Familienangelegenheiten" },
  { name: "Behörden", description: "Ausweise, Bewilligungen, Amtskorrespondenz" },
  { name: "Ausbildung", description: "Diplome, Kurse, Zeugnisse" },
  { name: "Sonstiges", description: "Nicht zuordenbare Dokumente" },
] as const;

export type KnowledgeAreaName = (typeof KNOWLEDGE_AREAS)[number]["name"];

export const BUILTIN_KNOWLEDGE_AREA_NAMES = new Set(
  KNOWLEDGE_AREAS.map((a) => a.name)
);
