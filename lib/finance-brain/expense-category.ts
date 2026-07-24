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

type CategoryDef = {
  label: string;
  tone: IconTone;
  icon: LucideIcon;
  keywords: string[];
  scene: string;
};

export const EXPENSE_CATEGORIES: CategoryDef[] = [
  {
    label: "Essen",
    tone: "green",
    icon: UtensilsCrossed,
    scene: "cozy meal or breakfast table atmosphere",
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
      "menü",
      "menu",
      "buffet",
      "kantine",
      "mensa",
    ],
  },
  {
    label: "Café",
    tone: "green",
    icon: Coffee,
    scene: "warm café counter with coffee cup atmosphere",
    keywords: ["café", "cafe", "kaffee", "coffee", "bäckerei", "bakery"],
  },
  {
    label: "Bar",
    tone: "green",
    icon: Wine,
    scene: "friendly evening bar or aperitif atmosphere",
    keywords: ["bar", "drink", "getränk", "wein", "bier", "cocktail", "pub"],
  },
  {
    label: "Hotel",
    tone: "green",
    icon: BedDouble,
    scene: "welcoming hotel exterior or lobby atmosphere",
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
    tone: "green",
    icon: Plane,
    scene: "airport terminal or aircraft cabin travel atmosphere",
    keywords: ["flug", "flight", "airline", "airport", "boarding", "swiss", "lufthansa"],
  },
  {
    label: "Bahn",
    tone: "green",
    icon: TrainFront,
    scene: "train station or scenic train journey atmosphere",
    keywords: ["bahn", "zug", "train", "sbb", "öbb", "rail"],
  },
  {
    label: "Bus",
    tone: "green",
    icon: Bus,
    scene: "city bus or transit atmosphere",
    keywords: ["bus", "tram", "metro", "u-bahn", "subway", "öpnv"],
  },
  {
    label: "Taxi / Transfer",
    tone: "green",
    icon: Car,
    scene: "city transfer or taxi ride atmosphere",
    keywords: ["taxi", "uber", "lyft", "transfer", "shuttle", "bolt"],
  },
  {
    label: "Mietwagen",
    tone: "green",
    icon: Car,
    scene: "scenic road trip rental car atmosphere",
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
    tone: "green",
    icon: Fuel,
    scene: "roadside fuel stop travel atmosphere",
    keywords: ["tank", "benzin", "diesel", "fuel", "gas station", "shell", "esso"],
  },
  {
    label: "Parken",
    tone: "green",
    icon: ParkingCircle,
    scene: "parking garage or city parking atmosphere",
    keywords: ["park", "parking", "parkhaus"],
  },
  {
    label: "Einkauf",
    tone: "green",
    icon: ShoppingBag,
    scene: "market or grocery shopping atmosphere",
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
    tone: "green",
    icon: Ticket,
    scene: "museum ticket desk or cultural venue atmosphere",
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
    scene: "outdoor activity or sightseeing atmosphere",
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
    tone: "green",
    icon: Ship,
    scene: "ferry deck or harbor atmosphere",
    keywords: ["schiff", "ferry", "fähre", "boot", "boat", "cruise"],
  },
  {
    label: "Versicherung",
    tone: "green",
    icon: Shield,
    scene: "calm administrative paperwork atmosphere, no logos",
    keywords: ["versicherung", "prämie", "insurance", "concordia", "css", "helvetia"],
  },
  {
    label: "Bank / Gebühr",
    tone: "green",
    icon: Landmark,
    scene: "subtle banking / currency exchange atmosphere, no logos",
    keywords: ["gebühr", "fee", "bank", "wechsel", "atm", "bancomat"],
  },
  {
    label: "Rückzahlung",
    tone: "green",
    icon: ArrowLeftRight,
    scene: "friendly handshake settlement atmosphere",
    keywords: ["rückzahlung", "ausgleich", "settle", "repayment"],
  },
  {
    label: "Ausgabe",
    tone: "green",
    icon: Banknote,
    scene: "friendly shared travel expense atmosphere",
    keywords: [],
  },
];

export const EXPENSE_CATEGORY_LABELS = EXPENSE_CATEGORIES.map((c) => c.label);

const DEFAULT_VISUAL: ExpenseVisual = {
  icon: Banknote,
  tone: "green",
  label: "Ausgabe",
};

const BY_LABEL = new Map(
  EXPENSE_CATEGORIES.map((c) => [c.label.toLowerCase(), c])
);

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

export function expenseVisualFromLabel(
  label: string | null | undefined,
  toneOverride?: string | null
): ExpenseVisual {
  const key = (label || "").trim().toLowerCase();
  const cat = BY_LABEL.get(key);
  if (!cat) return DEFAULT_VISUAL;
  const tone =
    toneOverride && toneOverride in iconToneGuard
      ? (toneOverride as IconTone)
      : cat.tone;
  return { icon: cat.icon, tone, label: cat.label };
}

const iconToneGuard: Record<string, true> = {
  blue: true,
  amber: true,
  rose: true,
  orange: true,
  green: true,
  teal: true,
  sky: true,
  indigo: true,
  violet: true,
  slate: true,
};

export function sceneForExpenseCategory(label: string | null | undefined): string {
  const cat = BY_LABEL.get((label || "").trim().toLowerCase());
  return cat?.scene ?? "friendly shared travel expense atmosphere";
}

/** Keyword fallback when AI is unavailable. */
export function expenseVisualFromText(
  description: string | null | undefined
): ExpenseVisual {
  const raw = (description || "").trim();
  if (!raw) return DEFAULT_VISUAL;
  const hay = normalize(raw);

  for (const rule of EXPENSE_CATEGORIES) {
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

export function expenseVisualForExpense(expense: {
  description?: string | null;
  category_label?: string | null;
  category_tone?: string | null;
}): ExpenseVisual {
  if (expense.category_label?.trim()) {
    return expenseVisualFromLabel(
      expense.category_label,
      expense.category_tone
    );
  }
  return expenseVisualFromText(expense.description);
}

export function settlementVisual(): ExpenseVisual {
  return {
    icon: ArrowLeftRight,
    tone: "green",
    label: "Rückzahlung",
  };
}

export function resolveCategoryLabel(raw: string | null | undefined): string {
  const key = (raw || "").trim().toLowerCase();
  if (!key) return "Ausgabe";
  const exact = BY_LABEL.get(key);
  if (exact) return exact.label;
  for (const cat of EXPENSE_CATEGORIES) {
    if (key.includes(cat.label.toLowerCase())) return cat.label;
  }
  return "Ausgabe";
}
