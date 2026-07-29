"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Files,
  RefreshCw,
  Brain,
  Shield,
  CalendarClock,
  Wallet,
  HandCoins,
  Plane,
  Settings,
  MessageSquare,
  LogOut,
  BookOpen,
  Luggage,
  ArrowLeft,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalysis } from "@/components/analysis/analysis-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { useAdminNav } from "@/components/layout/admin-nav-provider";
import { UserAvatar } from "@/components/users/user-avatar";
import { APP_VERSION } from "@/lib/app-version";
import { IconCircle, type IconTone } from "@/components/layout/icon-circle";
import type { AdminNavMode } from "@/lib/navigation/admin-nav";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: IconTone;
  countKey?:
    | "pendingCount"
    | "urgentDeadlinesCount"
    | "warrantiesExpiringSoon"
    | "openDueFinanceCount";
  /** Prefer pending styling when count is the analysis backlog */
  pendingStyle?: boolean;
};

const myBrainNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tone: "teal" },
  {
    href: "/documents",
    label: "Dokumente",
    icon: Files,
    tone: "teal",
  },
  {
    href: "/warranties",
    label: "Garantien",
    icon: Shield,
    tone: "teal",
    countKey: "warrantiesExpiringSoon",
  },
  {
    href: "/deadlines",
    label: "Fristen",
    icon: CalendarClock,
    tone: "teal",
    countKey: "urgentDeadlinesCount",
  },
  {
    href: "/finance",
    label: "Finanzen",
    icon: Wallet,
    tone: "green",
    countKey: "openDueFinanceCount",
  },
  {
    href: "/travel",
    label: "Reisen",
    icon: Plane,
    tone: "teal",
  },
  {
    href: "/knowledge",
    label: "Wissen",
    icon: Brain,
    tone: "teal",
  },
  { href: "/guides", label: "Guides", icon: BookOpen, tone: "teal" },
  { href: "/chat", label: "Chat", icon: MessageSquare, tone: "teal" },
  { href: "/settings", label: "Einstellungen", icon: Settings, tone: "teal" },
  {
    href: "/sync",
    label: "Sync",
    icon: RefreshCw,
    tone: "teal",
    countKey: "pendingCount",
    pendingStyle: true,
  },
];

const travelBuddyItem: NavItem = {
  href: "/trips",
  label: "TravelBuddy",
  icon: Luggage,
  tone: "green",
};

const finanzBuddyItem: NavItem = {
  href: "/finance-brain",
  label: "FinanzBuddy",
  icon: HandCoins,
  tone: "green",
};

const limitedUserNavItems: NavItem[] = [travelBuddyItem, finanzBuddyItem];

type AreaEntry = {
  mode: Exclude<AdminNavMode, "home">;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  tone: IconTone;
  href: string;
};

const areaEntries: AreaEntry[] = [
  {
    mode: "mybrain",
    label: "MyBrain",
    shortLabel: "Brain",
    description: "Dokumente, Wissen und Assistent",
    icon: Brain,
    tone: "teal",
    href: "/dashboard",
  },
  {
    mode: "travelbuddy",
    label: "TravelBuddy",
    shortLabel: "Travel",
    description: "Reisen planen und teilen",
    icon: Luggage,
    tone: "green",
    href: "/trips",
  },
  {
    mode: "finanzbuddy",
    label: "FinanzBuddy",
    shortLabel: "Finanz",
    description: "Gemeinsame Ausgaben und Abrechnung",
    icon: HandCoins,
    tone: "green",
    href: "/finance-brain",
  },
];

function formatCount(n: number) {
  return new Intl.NumberFormat("de-CH").format(n);
}

function NavLinkRow({
  item,
  pathname,
  showBadges,
  isRunning,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  showBadges: boolean;
  isRunning: boolean;
  onNavigate?: () => void;
}) {
  const active =
    pathname === item.href || pathname.startsWith(`${item.href}/`);
  const analysis = useAnalysis();
  const count =
    showBadges && item.countKey != null
      ? Number(analysis[item.countKey] || 0)
      : null;
  const showCount = count != null && count > 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-white/10 text-white"
          : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-white"
      )}
    >
      <IconCircle
        icon={item.icon}
        tone={item.tone}
        size="sm"
        variant="solid"
        className="rounded-lg shadow-md ring-1 ring-white/25"
      />
      <span className="flex-1 text-[15px] font-semibold tracking-tight">
        {item.label}
      </span>
      {showCount ? (
        <span
          className={cn(
            "min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums",
            active
              ? "bg-white/25 text-white"
              : item.pendingStyle && isRunning
                ? "bg-amber-500 text-white"
                : "bg-white/15 text-white"
          )}
          title={
            item.countKey === "pendingCount"
              ? "Ausstehende Analysen"
              : item.countKey === "urgentDeadlinesCount"
                ? "Dringende Fristen (überfällig ≤30 Tage oder in ≤7 Tagen)"
                : item.countKey === "warrantiesExpiringSoon"
                  ? "Garantien in den nächsten 90 Tagen"
                  : item.countKey === "openDueFinanceCount"
                    ? "Offene Rechnungen (Paperless Zu bezahlen)"
                    : undefined
          }
        >
          {formatCount(count)}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const analysis = useAnalysis();
  const { me } = useAuth();
  const { mode, setMode, goHome, isAdminNav } = useAdminNav();
  const { isRunning } = analysis;
  const isLimitedUser = me != null && !me.isAdmin;

  const brandTitle = isAdminNav
    ? "BuddyApp"
    : isLimitedUser
      ? "TripBook"
      : "TripBook";
  const brandHref = isLimitedUser
    ? "/trips"
    : isAdminNav
      ? mode === "travelbuddy"
        ? "/trips"
        : mode === "finanzbuddy"
          ? "/finance-brain"
          : mode === "mybrain"
            ? "/dashboard"
            : "/dashboard"
      : "/dashboard";

  function selectArea(entry: AreaEntry) {
    setMode(entry.mode, { exitedHome: true });
    router.push(entry.href);
    onNavigate?.();
  }

  function handleGoHome() {
    goHome();
    onNavigate?.();
  }

  const showAreaSwitcher = isAdminNav && mode !== "home";

  let listItems: NavItem[] = [];
  if (isLimitedUser) {
    listItems = limitedUserNavItems;
  } else if (isAdminNav) {
    if (mode === "mybrain") listItems = myBrainNavItems;
    else if (mode === "travelbuddy") listItems = [travelBuddyItem];
    else if (mode === "finanzbuddy") listItems = [finanzBuddyItem];
    else listItems = [];
  } else {
    listItems = [...myBrainNavItems, travelBuddyItem, finanzBuddyItem];
  }

  return (
    <aside
      className={cn(
        "flex h-full w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <div className="px-5 py-6">
        <button
          type="button"
          className="flex w-full items-center gap-3 text-left"
          onClick={() => {
            if (isAdminNav) {
              handleGoHome();
              return;
            }
            router.push(brandHref);
            onNavigate?.();
          }}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            {isAdminNav ? (
              <LayoutGrid className="h-6 w-6" />
            ) : (
              <BookOpen className="h-6 w-6" />
            )}
          </span>
          <span className="text-3xl font-extrabold leading-none tracking-tight text-white">
            {brandTitle}
          </span>
        </button>
        {me ? (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">
            <UserAvatar
              name={me.displayName}
              src={me.avatarUrl}
              size="md"
              className="ring-white/30"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium leading-none text-sidebar-foreground/65">
                Angemeldet als:
              </p>
              <p
                className="mt-1.5 truncate text-sm font-semibold tracking-tight text-white"
                title={me.displayName}
              >
                {me.displayName}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {showAreaSwitcher ? (
        <div className="space-y-2 px-3 pb-3">
          <button
            type="button"
            onClick={handleGoHome}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-white"
          >
            <ArrowLeft className="size-3.5 shrink-0" />
            Zurück zu BuddyApp
          </button>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/10 p-1">
            {areaEntries.map((entry) => {
              const active = mode === entry.mode;
              return (
                <button
                  key={entry.mode}
                  type="button"
                  title={entry.label}
                  onClick={() => selectArea(entry)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold leading-tight transition-colors",
                    active
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <entry.icon className="size-3.5" />
                  <span className="truncate">{entry.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {isAdminNav && mode === "home" ? (
          <div className="space-y-2 pt-1">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
              Bereiche
            </p>
            {areaEntries.map((entry) => (
              <button
                key={entry.mode}
                type="button"
                onClick={() => selectArea(entry)}
                className="flex w-full items-start gap-3 rounded-xl bg-white/5 px-3 py-3 text-left transition-colors hover:bg-white/10"
              >
                <IconCircle
                  icon={entry.icon}
                  tone={entry.tone}
                  size="sm"
                  variant="solid"
                  className="mt-0.5 rounded-lg shadow-md ring-1 ring-white/25"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold tracking-tight text-white">
                    {entry.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-sidebar-foreground/65">
                    {entry.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          listItems.map((item) => (
            <NavLinkRow
              key={item.href}
              item={item}
              pathname={pathname}
              showBadges={!isLimitedUser}
              isRunning={isRunning}
              onNavigate={onNavigate}
            />
          ))
        )}
      </nav>

      <div className="mt-auto space-y-3 border-t border-sidebar-border/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
