/**
 * Canonical Lucide outline icons for Buddy (mockup-aligned).
 * Keep outline style; stroke is intentionally bold for clarity.
 */
import type { LucideIcon } from "lucide-react";
import {
  Home,
  Inbox,
  Mail,
  FileText,
  Calendar,
  CalendarDays,
  ChartColumnIncreasing,
  Briefcase,
  Cloud,
  Shield,
  BookOpen,
  MessageCircle,
  Settings,
  UserRound,
  RefreshCw,
  Library,
  HandCoins,
  Luggage,
  Sparkles,
  Headset,
} from "lucide-react";

/** Bold outline stroke (mockup style, maximum readable weight). */
export const APP_ICON_STROKE = 2.5;

export type AppIconTone =
  | "blue"
  | "amber"
  | "rose"
  | "orange"
  | "green"
  | "teal"
  | "sky"
  | "indigo"
  | "violet"
  | "slate";

export type AppIconSpec = {
  icon: LucideIcon;
  tone: AppIconTone;
};

export const appIcons = {
  overview: { icon: Home, tone: "teal" as const },
  inbox: { icon: Inbox, tone: "teal" as const },
  mail: { icon: Mail, tone: "teal" as const },
  google: { icon: Cloud, tone: "teal" as const },
  documents: { icon: FileText, tone: "teal" as const },
  calendar: { icon: CalendarDays, tone: "teal" as const },
  deadlines: { icon: Calendar, tone: "teal" as const },
  finance: { icon: ChartColumnIncreasing, tone: "green" as const },
  travel: { icon: Briefcase, tone: "teal" as const },
  warranties: { icon: Shield, tone: "teal" as const },
  knowledge: { icon: BookOpen, tone: "teal" as const },
  guides: { icon: Library, tone: "teal" as const },
  chat: { icon: MessageCircle, tone: "teal" as const },
  settings: { icon: Settings, tone: "teal" as const },
  account: { icon: UserRound, tone: "teal" as const },
  sync: { icon: RefreshCw, tone: "teal" as const },
  dashboard: { icon: Home, tone: "teal" as const },
  financeBrain: { icon: HandCoins, tone: "green" as const },
  trips: { icon: Luggage, tone: "green" as const },
  summaries: { icon: Sparkles, tone: "teal" as const },
  buddyArea: { icon: Home, tone: "teal" as const },
  microsoft: { icon: Cloud, tone: "blue" as const },
  maringo: { icon: Headset, tone: "orange" as const },
} as const satisfies Record<string, AppIconSpec>;

export type AppIconKey = keyof typeof appIcons;
