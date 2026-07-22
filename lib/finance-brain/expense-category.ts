import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BedDouble,
  Bus,
  Car,
  Coffee,
  Fuel,
  Plane,
  ShoppingBag,
  Ticket,
  TrainFront,
  UtensilsCrossed,
  Wine,
  Shield,
  ParkingCircle,
  Landmark,
  Ship,
  Mountain,
  ArrowLeftRight,
} from "lucide-react";
import type { IconTone } from "@/components/layout/icon-circle";

export type ExpenseVisual = {
  icon: LucideIcon;
  tone: IconTone;
  label: string;
};

type Rule = {
  label: string;
  tone: IconTone;
  icon: LucideIcon;
  keywords: string[];
};

const RULES: Rule[] = [
  {
    label: "Essen",
    tone: "orange",
    icon: UtensilsCrossed,
    keywords: [
      "restaurant",
      "essen",
      "food",
      "fruehstueck",
      "frühstück",
      "breakfast",
      "brunch",
      "mittagessen",
      "mittag",
      "abendessen",
      "nachtessen",
      "znacht",
      "znüni",
      "znuni",
      "zvieri",
      "lunch",
      "dinner",
      "supper",
      "meal",
      "pizza",
      "burger",
      "sushi",
      "imbiss",
      "takeaway",
      "delivery",
      "mcdonald",
      "starbucks",
      "menü",
      "menu",
      "buffet",
      "cantine",
      "kantine",
      "mensa",
    ],
  },
  {
    label: "Café",
    tone: "amber",
    icon: Coffee,
    keywords: ["café", "cafe", "kaffee", "coffee", "bäckerei", "bakery"],
  },
  {
    label: "Bar",
    tone: "rose",
    icon: Wine,
    keywords: ["bar", "drink", "getränk", "wein", "bier", "cocktail", "pub"],
  },
  {
    label: "Hotel",
    tone: "indigo",
    icon: BedDouble,
    keywords: [
      "hotel",
      "übernacht",
      "overnight",
      "airbnb",
      "hostel",
      "unterkunft",
      "apartment",
      "marriott",
      "hilton",
      "booking",
    ],
  },
  {
    label: "Flug",
    tone: "sky",
    icon: Plane,
    keywords: ["flug", "flight", "airline", "airport", "boarding", "swiss", "lufthansa"],
  },
  {
    label: "Bahn",
    tone: "teal",
    icon: TrainFront,
    keywords: ["bahn", "zug", "train", "sbb", "öbb", "rail", "ticket zug"],
  },
  {
    label: "Bus",
    tone: "teal",
    icon: Bus,
    keywords: ["bus", "tram", "metro", "u-bahn", "subway", "öpnv"],
  },
  {
    label: "Taxi / Transfer",
    tone: "teal",
    icon: Car,
    keywords: ["taxi", "uber", "lyft", "transfer", "shuttle", "bolt"],
  },
  {
    label: "Mietwagen",
    tone: "teal",
    icon: Car,
    keywords: [
      "mietwagen",
      "mietauto",
      "rental",
      "alamo",
      "hertz",
      "sixt",
      "enterprise",
      "avis",
    ],
  },
  {
    label: "Tanken",
    tone: "amber",
    icon: Fuel,
    keywords: ["tank", "benzin", "diesel", "fuel", "gas station", "shell", "esso"],
  },
  {
    label: "Parken",
    tone: "slate",
    icon: ParkingCircle,
    keywords: ["park", "parking", "parkhaus"],
  },
  {
    label: "Einkauf",
    tone: "violet",
    icon: ShoppingBag,
    keywords: [
      "einkauf",
      "shop",
      "shopping",
      "migros",
      "coop",
      "amazon",
      "supermarket",
      "lebensmittel",
      "grocery",
      "markt",
    ],
  },
  {
    label: "Ticket / Kultur",
    tone: "rose",
    icon: Ticket,
    keywords: [
      "ticket",
      "eintritt",
      "museum",
      "konzert",
      "theater",
      "kino",
      "cinema",
      "show",
      "festival",
    ],
  },
  {
    label: "Aktivität",
    tone: "green",
    icon: Mountain,
    keywords: [
      "wanderung",
      "ski",
      "berg",
      "tour",
      "ausflug",
      "aktivität",
      "surf",
      "dive",
      "tauchen",
    ],
  },
  {
    label: "Schiff",
    tone: "sky",
    icon: Ship,
    keywords: ["schiff", "ferry", "fähre", "boot", "boat", "cruise"],
  },
  {
    label: "Versicherung",
    tone: "slate",
    icon: Shield,
    keywords: ["versicherung", "prämie", "insurance", "concordia", "css", "helvetia"],
  },
  {
    label: "Bank / Gebühr",
    tone: "slate",
    icon: Landmark,
    keywords: ["gebühr", "fee", "bank", "wechsel", "atm", "bancomat"],
  },
  {
    label: "Rückzahlung",
    tone: "green",
    icon: ArrowLeftRight,
    keywords: ["rückzahlung", "ausgleich", "settle", "repayment", "bezahlt zurück"],
  },
];

const DEFAULT_VISUAL: ExpenseVisual = {
  icon: Banknote,
  tone: "green",
  label: "Ausgabe",
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Infer a TravelBrain-style icon/tone from free-text expense description. */
export function expenseVisualFromText(
  description: string | null | undefined
): ExpenseVisual {
  const raw = (description || "").trim();
  if (!raw) return DEFAULT_VISUAL;
  const hay = normalize(raw);

  for (const rule of RULES) {
    for (const keyword of rule.keywords) {
      if (hay.includes(normalize(keyword))) {
        return {
          icon: rule.icon,
          tone: rule.tone,
          label: rule.label,
        };
      }
    }
  }
  return DEFAULT_VISUAL;
}

export function settlementVisual(): ExpenseVisual {
  return {
    icon: ArrowLeftRight,
    tone: "teal",
    label: "Rückzahlung",
  };
}
