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
  CreditCard,
  Monitor,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE, appIcons } from "@/lib/branding/app-icons";

export const iconToneClasses = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-rose-50 text-rose-500 dark:bg-rose-500/15 dark:text-rose-300",
  orange:
    "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  /** Sage / FinanzBuddy */
  green: "bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]",
  /** Dokumente / TravelBuddy — same sage as FinanzBuddy */
  teal: "bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
  indigo:
    "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  violet:
    "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  /** Settings navy-ish */
  slate: "bg-[var(--brand-settings-soft)] text-[var(--brand-settings)]",
} as const;

/** High-contrast icon wells for dark sidebar / overlay nav */
export const iconToneSolidClasses = {
  blue: "bg-blue-500 text-white",
  amber: "bg-amber-500 text-white",
  rose: "bg-rose-500 text-white",
  orange: "bg-orange-500 text-white",
  green: "bg-[var(--brand-finance)] text-white",
  teal: "bg-[var(--brand-finance)] text-white",
  sky: "bg-sky-500 text-white",
  indigo: "bg-indigo-500 text-white",
  violet: "bg-violet-500 text-white",
  slate: "bg-[var(--brand-settings)] text-white",
} as const;

/**
 * Card surfaces derived from the same tone as icons / knowledge areas.
 * title = medium (halbkräftig), body = soft (dezent).
 */
export const toneSurfaceClasses = {
  blue: {
    title:
      "border-blue-300/70 bg-blue-200/90 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-100",
    body: "border-blue-200/80 bg-blue-50/90 dark:border-blue-500/20 dark:bg-blue-500/10",
    soft: "bg-blue-100/60 dark:bg-blue-500/10",
  },
  amber: {
    title:
      "border-amber-300/70 bg-amber-200/90 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100",
    body: "border-amber-200/80 bg-amber-50/90 dark:border-amber-500/20 dark:bg-amber-500/10",
    soft: "bg-amber-100/60 dark:bg-amber-500/10",
  },
  rose: {
    title:
      "border-rose-300/70 bg-rose-200/90 text-rose-950 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-100",
    body: "border-rose-200/80 bg-rose-50/90 dark:border-rose-500/20 dark:bg-rose-500/10",
    soft: "bg-rose-100/60 dark:bg-rose-500/10",
  },
  orange: {
    title:
      "border-orange-300/70 bg-orange-200/90 text-orange-950 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-100",
    body: "border-orange-200/80 bg-orange-50/90 dark:border-orange-500/20 dark:bg-orange-500/10",
    soft: "bg-orange-100/60 dark:bg-orange-500/10",
  },
  green: {
    title:
      "border-[color-mix(in_oklab,var(--brand-finance),white_55%)] bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]",
    body: "border-[color-mix(in_oklab,var(--brand-finance),white_70%)] bg-card",
    soft: "bg-[var(--brand-finance-soft)]",
  },
  teal: {
    title:
      "border-[color-mix(in_oklab,var(--brand-docs),white_55%)] bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]",
    body: "border-[color-mix(in_oklab,var(--brand-docs),white_70%)] bg-card",
    soft: "bg-[var(--brand-docs-soft)]",
  },
  sky: {
    title:
      "border-sky-300/70 bg-sky-200/90 text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-100",
    body: "border-sky-200/80 bg-sky-50/90 dark:border-sky-500/20 dark:bg-sky-500/10",
    soft: "bg-sky-100/60 dark:bg-sky-500/10",
  },
  indigo: {
    title:
      "border-indigo-300/70 bg-indigo-200/90 text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-100",
    body: "border-indigo-200/80 bg-indigo-50/90 dark:border-indigo-500/20 dark:bg-indigo-500/10",
    soft: "bg-indigo-100/60 dark:bg-indigo-500/10",
  },
  violet: {
    title:
      "border-violet-300/70 bg-violet-200/90 text-violet-950 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-100",
    body: "border-violet-200/80 bg-violet-50/90 dark:border-violet-500/20 dark:bg-violet-500/10",
    soft: "bg-violet-100/60 dark:bg-violet-500/10",
  },
  slate: {
    title:
      "border-[color-mix(in_oklab,var(--brand-settings),white_60%)] bg-[var(--brand-settings-soft)] text-[var(--brand-settings)]",
    body: "border-[color-mix(in_oklab,var(--brand-settings),white_75%)] bg-card",
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
  /** soft = pastel (default); solid = saturated fill for dark nav; ghost = outline only */
  variant?: "soft" | "solid" | "ghost";
  /** circle (default) or rounded square like Travel mockup tiles */
  shape?: "circle" | "rounded";
  className?: string;
};

/** Wrap sizes stay fixed; glyphs fill ~75% so soft wells look fuller without overflow. */
const sizeClasses = {
  sm: { wrap: "h-8 w-8", icon: "h-6 w-6" },
  md: { wrap: "h-10 w-10", icon: "h-7 w-7" },
  lg: { wrap: "h-12 w-12", icon: "h-9 w-9" },
} as const;

export function IconCircle({
  icon: Icon,
  tone = "blue",
  size = "md",
  variant = "soft",
  shape = "circle",
  className,
}: IconCircleProps) {
  const s = sizeClasses[size];
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center",
        shape === "rounded" ? "rounded-2xl" : "rounded-full",
        s.wrap,
        variant === "solid"
          ? iconToneSolidClasses[tone]
          : variant === "ghost"
            ? "bg-transparent text-current"
            : iconToneClasses[tone],
        className
      )}
    >
      <Icon
        className={cn(s.icon)}
        strokeWidth={APP_ICON_STROKE}
        absoluteStrokeWidth
        aria-hidden
      />
    </div>
  );
}

export const knowledgeAreaVisuals: Record<
  string,
  { icon: LucideIcon; tone: IconTone }
> = {
  Gesundheit: { icon: HeartPulse, tone: "teal" },
  Versicherungen: { icon: Shield, tone: "teal" },
  Wohnen: { icon: Home, tone: "teal" },
  Steuern: { icon: Landmark, tone: "teal" },
  Kreditkarten: { icon: CreditCard, tone: "teal" },
  Finanzen: { icon: Wallet, tone: "teal" },
  Reisen: { icon: Plane, tone: "teal" },
  Fahrzeuge: { icon: Car, tone: "teal" },
  Arbeit: { icon: Briefcase, tone: "teal" },
  Geschäftlich: { icon: Briefcase, tone: "slate" },
  Computer: { icon: Monitor, tone: "teal" },
  "Geräte & Garantien": { icon: Cpu, tone: "teal" },
  Verträge: { icon: FileSignature, tone: "teal" },
  "Kinder / Familie": { icon: Users, tone: "teal" },
  Behörden: { icon: Building2, tone: "teal" },
  Ausbildung: { icon: GraduationCap, tone: "teal" },
  Sonstiges: { icon: FolderOpen, tone: "teal" },
  Wissen: { icon: BookOpen, tone: "teal" },
};

/** Page headers + nav — single source, mockup-aligned outline icons. */
export const pageVisuals = {
  dashboard: appIcons.overview,
  overview: appIcons.overview,
  inbox: appIcons.inbox,
  mail: appIcons.mail,
  google: appIcons.google,
  documents: appIcons.documents,
  calendar: appIcons.calendar,
  chat: appIcons.chat,
  sync: appIcons.sync,
  knowledge: appIcons.knowledge,
  warranties: appIcons.warranties,
  deadlines: appIcons.deadlines,
  finance: appIcons.finance,
  financeBrain: appIcons.financeBrain,
  travel: appIcons.travel,
  trips: appIcons.trips,
  settings: appIcons.settings,
  account: appIcons.account,
  summaries: appIcons.summaries,
  guides: appIcons.guides,
  microsoft: appIcons.microsoft,
  maringo: appIcons.maringo,
} as const;

export function knowledgeVisual(name: string): {
  icon: LucideIcon;
  tone: IconTone;
} {
  return knowledgeAreaVisuals[name] || { icon: FolderOpen, tone: "teal" };
}
