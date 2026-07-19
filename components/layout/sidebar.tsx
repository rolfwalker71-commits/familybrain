"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Files,
  RefreshCw,
  Brain,
  Shield,
  CalendarClock,
  Wallet,
  Plane,
  Settings,
  MessageSquare,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalysis } from "@/components/analysis/analysis-provider";
import { APP_VERSION } from "@/lib/app-version";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  countKey?:
    | "totalDocuments"
    | "pendingCount"
    | "knowledgeDocuments"
    | "warrantiesTotal"
    | "deadlinesOpen"
    | "financialItemsTotal"
    | "travelDocuments";
  /** Prefer pending styling when count is the analysis backlog */
  pendingStyle?: boolean;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/documents",
    label: "Dokumente",
    icon: Files,
    countKey: "totalDocuments",
  },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  {
    href: "/sync",
    label: "Sync",
    icon: RefreshCw,
    countKey: "pendingCount",
    pendingStyle: true,
  },
  {
    href: "/knowledge",
    label: "Wissensbereiche",
    icon: Brain,
    countKey: "knowledgeDocuments",
  },
  {
    href: "/warranties",
    label: "Garantien",
    icon: Shield,
    countKey: "warrantiesTotal",
  },
  {
    href: "/deadlines",
    label: "Fristen",
    icon: CalendarClock,
    countKey: "deadlinesOpen",
  },
  {
    href: "/finance",
    label: "Finanzen",
    icon: Wallet,
    countKey: "financialItemsTotal",
  },
  {
    href: "/travel",
    label: "Reisen",
    icon: Plane,
    countKey: "travelDocuments",
  },
  { href: "/settings", label: "Einstellungen", icon: Settings },
];

function formatCount(n: number) {
  return new Intl.NumberFormat("de-CH").format(n);
}

export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const analysis = useAnalysis();
  const { isRunning } = analysis;

  return (
    <aside
      className={cn(
        "flex h-full w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <div className="px-5 py-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Brain className="h-6 w-6" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">
            FamilyBrain
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 pb-4">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const count =
            item.countKey != null ? Number(analysis[item.countKey] || 0) : null;
          const showCount = count != null && count > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              <span className="flex-1">{item.label}</span>
              {showCount ? (
                <span
                  className={cn(
                    "min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums",
                    active
                      ? "bg-white/20 text-white"
                      : item.pendingStyle && isRunning
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-sidebar-primary/30 text-blue-200"
                  )}
                  title={
                    item.countKey === "pendingCount"
                      ? "Ausstehende Analysen"
                      : item.countKey === "deadlinesOpen"
                        ? "Offene Fristen"
                        : undefined
                  }
                >
                  {formatCount(count)}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-sidebar-border/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" }).catch(
              () => undefined
            );
            window.location.assign("/login");
          }}
        >
          <LogOut className="size-4" />
          Abmelden
        </button>
        <p
          className="font-mono text-[10px] tabular-nums tracking-wide text-sidebar-foreground/50"
          title="App-Version (Datum-Uhrzeit des letzten Commits)"
        >
          {APP_VERSION}
        </p>
      </div>
    </aside>
  );
}
