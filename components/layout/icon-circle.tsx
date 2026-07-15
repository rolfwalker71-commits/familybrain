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

export type IconTone = keyof typeof iconToneClasses;

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
