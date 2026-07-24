import type { LucideIcon } from "lucide-react";
import {
  HeartPulse,
  Shield,
  Home,
  Landmark,
  Wallet,
  Plane,
  Car,
  Briefcase,
  Cpu,
  FileSignature,
  Users,
  Building2,
  GraduationCap,
  FolderOpen,
  Files,
  MessageSquare,
  RefreshCw,
  Brain,
  CalendarClock,
  Settings,
  Sparkles,
  LayoutDashboard,
  BookOpen,
  HandCoins,
  Luggage,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const iconToneClasses = {
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-500",
  orange: "bg-orange-50 text-orange-600",
  /** Sage / FinanzBrain */
  green: "bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]",
  /** Dokumente / FamilyBrain default */
  teal: "bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]",
  sky: "bg-sky-50 text-sky-600",
  indigo: "bg-indigo-50 text-indigo-600",
  violet: "bg-violet-50 text-violet-600",
  /** Settings navy-ish */
  slate: "bg-[var(--brand-settings-soft)] text-[var(--brand-settings)]",
} as const;

/**
 * Card surfaces derived from the same tone as icons / knowledge areas.
 * title = medium (halbkräftig), body = soft (dezent).
 */
export const toneSurfaceClasses = {
  blue: {
    title: "border-blue-300/70 bg-blue-200/90 text-blue-950",
    body: "border-blue-200/80 bg-blue-50/90",
    soft: "bg-blue-100/60",
  },
  amber: {
    title: "border-amber-300/70 bg-amber-200/90 text-amber-950",
    body: "border-amber-200/80 bg-amber-50/90",
    soft: "bg-amber-100/60",
  },
  rose: {
    title: "border-rose-300/70 bg-rose-200/90 text-rose-950",
    body: "border-rose-200/80 bg-rose-50/90",
    soft: "bg-rose-100/60",
  },
  orange: {
    title: "border-orange-300/70 bg-orange-200/90 text-orange-950",
    body: "border-orange-200/80 bg-orange-50/90",
    soft: "bg-orange-100/60",
  },
  green: {
    title:
      "border-[color-mix(in_oklab,var(--brand-finance),white_55%)] bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]",
    body: "border-[color-mix(in_oklab,var(--brand-finance),white_70%)] bg-white",
    soft: "bg-[var(--brand-finance-soft)]",
  },
  teal: {
    title:
      "border-[color-mix(in_oklab,var(--brand-docs),white_55%)] bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]",
    body: "border-[color-mix(in_oklab,var(--brand-docs),white_70%)] bg-white",
    soft: "bg-[var(--brand-docs-soft)]",
  },
  sky: {
    title: "border-sky-300/70 bg-sky-200/90 text-sky-950",
    body: "border-sky-200/80 bg-sky-50/90",
    soft: "bg-sky-100/60",
  },
  indigo: {
    title: "border-indigo-300/70 bg-indigo-200/90 text-indigo-950",
    body: "border-indigo-200/80 bg-indigo-50/90",
    soft: "bg-indigo-100/60",
  },
  violet: {
    title: "border-violet-300/70 bg-violet-200/90 text-violet-950",
    body: "border-violet-200/80 bg-violet-50/90",
    soft: "bg-violet-100/60",
  },
  slate: {
    title:
      "border-[color-mix(in_oklab,var(--brand-settings),white_60%)] bg-[var(--brand-settings-soft)] text-[var(--brand-settings)]",
    body: "border-[color-mix(in_oklab,var(--brand-settings),white_75%)] bg-white",
    soft: "bg-[var(--brand-settings-soft)]",
  },
} as const;

export type IconTone = keyof typeof iconToneClasses;

export function toneSurface(tone: IconTone = "blue") {
  return toneSurfaceClasses[tone];
}

type IconCircleProps = {
  icon: LucideIcon;
  tone?: IconTone;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: { wrap: "h-8 w-8", icon: "h-4 w-4" },
  md: { wrap: "h-10 w-10", icon: "h-5 w-5" },
  lg: { wrap: "h-12 w-12", icon: "h-6 w-6" },
} as const;

export function IconCircle({
  icon: Icon,
  tone = "blue",
  size = "md",
  className,
}: IconCircleProps) {
  const s = sizeClasses[size];
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        s.wrap,
        iconToneClasses[tone],
        className
      )}
    >
      <Icon className={s.icon} />
    </div>
  );
}

export const knowledgeAreaVisuals: Record<
  string,
  { icon: LucideIcon; tone: IconTone }
> = {
  Gesundheit: { icon: HeartPulse, tone: "rose" },
  Versicherungen: { icon: Shield, tone: "blue" },
  Wohnen: { icon: Home, tone: "amber" },
  Steuern: { icon: Landmark, tone: "indigo" },
  Finanzen: { icon: Wallet, tone: "green" },
  Reisen: { icon: Plane, tone: "teal" },
  Fahrzeuge: { icon: Car, tone: "sky" },
  Arbeit: { icon: Briefcase, tone: "slate" },
  "Geräte & Garantien": { icon: Cpu, tone: "orange" },
  Verträge: { icon: FileSignature, tone: "violet" },
  "Kinder / Familie": { icon: Users, tone: "rose" },
  Behörden: { icon: Building2, tone: "slate" },
  Ausbildung: { icon: GraduationCap, tone: "indigo" },
  Sonstiges: { icon: FolderOpen, tone: "slate" },
};

export const pageVisuals = {
  dashboard: { icon: LayoutDashboard, tone: "teal" as const },
  documents: { icon: Files, tone: "teal" as const },
  chat: { icon: MessageSquare, tone: "indigo" as const },
  sync: { icon: RefreshCw, tone: "green" as const },
  knowledge: { icon: Brain, tone: "violet" as const },
  warranties: { icon: Shield, tone: "orange" as const },
  deadlines: { icon: CalendarClock, tone: "rose" as const },
  finance: { icon: Wallet, tone: "green" as const },
  financeBrain: { icon: HandCoins, tone: "green" as const },
  travel: { icon: Plane, tone: "teal" as const },
  trips: { icon: Luggage, tone: "green" as const },
  settings: { icon: Settings, tone: "slate" as const },
  summaries: { icon: Sparkles, tone: "teal" as const },
  guides: { icon: BookOpen, tone: "teal" as const },
} as const;

export function knowledgeVisual(name: string): {
  icon: LucideIcon;
  tone: IconTone;
} {
  return knowledgeAreaVisuals[name] || { icon: FolderOpen, tone: "slate" };
}
