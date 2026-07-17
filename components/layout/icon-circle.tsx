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
} from "lucide-react";
import { cn } from "@/lib/utils";

export const iconToneClasses = {
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-500",
  orange: "bg-orange-50 text-orange-600",
  green: "bg-emerald-50 text-emerald-600",
  teal: "bg-teal-50 text-teal-600",
  sky: "bg-sky-50 text-sky-600",
  indigo: "bg-indigo-50 text-indigo-600",
  violet: "bg-violet-50 text-violet-600",
  slate: "bg-slate-100 text-slate-600",
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
    title: "border-emerald-300/70 bg-emerald-200/90 text-emerald-950",
    body: "border-emerald-200/80 bg-emerald-50/90",
    soft: "bg-emerald-100/60",
  },
  teal: {
    title: "border-teal-300/70 bg-teal-200/90 text-teal-950",
    body: "border-teal-200/80 bg-teal-50/90",
    soft: "bg-teal-100/60",
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
    title: "border-slate-300/80 bg-slate-200/90 text-slate-900",
    body: "border-slate-200/80 bg-slate-50/90",
    soft: "bg-slate-100/70",
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
  dashboard: { icon: LayoutDashboard, tone: "blue" as const },
  documents: { icon: Files, tone: "blue" as const },
  chat: { icon: MessageSquare, tone: "indigo" as const },
  sync: { icon: RefreshCw, tone: "amber" as const },
  knowledge: { icon: Brain, tone: "violet" as const },
  warranties: { icon: Shield, tone: "orange" as const },
  deadlines: { icon: CalendarClock, tone: "rose" as const },
  finance: { icon: Wallet, tone: "green" as const },
  travel: { icon: Plane, tone: "teal" as const },
  settings: { icon: Settings, tone: "slate" as const },
  summaries: { icon: Sparkles, tone: "indigo" as const },
} as const;

export function knowledgeVisual(name: string): {
  icon: LucideIcon;
  tone: IconTone;
} {
  return knowledgeAreaVisuals[name] || { icon: FolderOpen, tone: "slate" };
}
