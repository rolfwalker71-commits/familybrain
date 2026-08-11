"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalysis } from "@/components/analysis/analysis-provider";
import { useAuth } from "@/components/auth/auth-provider";
import {
  GoogleLogo,
  MaringoLogo,
  MicrosoftLogo,
} from "@/components/branding/provider-logos";
import { useAdminNav } from "@/components/layout/admin-nav-provider";
import { UserAvatar } from "@/components/users/user-avatar";
import { APP_VERSION } from "@/lib/app-version";
import { BRAND } from "@/lib/branding";
import { BuddyLogo } from "@/components/brand/buddy-logo";
import { pageVisuals, type IconTone } from "@/components/layout/icon-circle";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { AdminNavMode } from "@/lib/navigation/admin-nav";

const SIDEBAR_COLLAPSED_KEY = "buddy.sidebar.collapsed";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Brand mark when Lucide outline is too generic (Google / Microsoft). */
  logo?: ReactNode;
  tone: IconTone;
  /** Sidebar section caption; shown before the first item of each group. */
  section?: string;
  countKey?:
    | "pendingCount"
    | "urgentDeadlinesCount"
    | "warrantiesExpiringSoon"
    | "openDueFinanceCount"
    | "triagePendingCount"
    | "mailTriageGoogleCount"
    | "mailTriageMicrosoftCount";
  pendingStyle?: boolean;
};

/** Order + icons match mockup (bold outline); sections for scanability. */
const myBrainNavItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Übersicht",
    icon: pageVisuals.overview.icon,
    tone: pageVisuals.overview.tone,
    section: "Tag",
  },
  {
    href: "/calendar",
    label: "Kalender",
    icon: pageVisuals.calendar.icon,
    tone: pageVisuals.calendar.tone,
  },
  {
    href: "/google",
    label: "Google Workspace",
    icon: pageVisuals.google.icon,
    logo: <GoogleLogo className="size-4" />,
    tone: pageVisuals.google.tone,
    section: "Cloud",
    countKey: "mailTriageGoogleCount",
    pendingStyle: true,
  },
  {
    href: "/microsoft",
    label: "Microsoft 365",
    icon: pageVisuals.microsoft.icon,
    logo: <MicrosoftLogo className="size-4" />,
    tone: pageVisuals.microsoft.tone,
    countKey: "mailTriageMicrosoftCount",
    pendingStyle: true,
  },
  {
    href: "/maringo",
    label: "Maringo Support",
    icon: pageVisuals.maringo.icon,
    logo: <MaringoLogo className="size-4" />,
    tone: pageVisuals.maringo.tone,
  },
  {
    href: "/inbox",
    label: "Inbox",
    icon: pageVisuals.inbox.icon,
    tone: pageVisuals.inbox.tone,
    countKey: "triagePendingCount",
    pendingStyle: true,
    section: "Handeln",
  },
  {
    href: "/documents",
    label: "Dokumente",
    icon: pageVisuals.documents.icon,
    tone: pageVisuals.documents.tone,
  },
  {
    href: "/deadlines",
    label: "Fristen",
    icon: pageVisuals.deadlines.icon,
    tone: pageVisuals.deadlines.tone,
    countKey: "urgentDeadlinesCount",
  },
  {
    href: "/finance",
    label: BRAND.financeBlick,
    icon: pageVisuals.finance.icon,
    tone: pageVisuals.finance.tone,
    countKey: "openDueFinanceCount",
  },
  {
    href: "/warranties",
    label: "Garantien",
    icon: pageVisuals.warranties.icon,
    tone: pageVisuals.warranties.tone,
    countKey: "warrantiesExpiringSoon",
  },
  {
    href: "/travel",
    label: BRAND.travelMemory,
    icon: pageVisuals.travel.icon,
    tone: pageVisuals.travel.tone,
  },
  {
    href: "/knowledge",
    label: "Wissen",
    icon: pageVisuals.knowledge.icon,
    tone: pageVisuals.knowledge.tone,
    section: "Wissen",
  },
  {
    href: "/guides",
    label: "Guides",
    icon: pageVisuals.guides.icon,
    tone: pageVisuals.guides.tone,
  },
  {
    href: "/chat",
    label: "Chat",
    icon: pageVisuals.chat.icon,
    tone: pageVisuals.chat.tone,
  },
  {
    href: "/account",
    label: "Konto",
    icon: pageVisuals.account.icon,
    tone: pageVisuals.account.tone,
    section: "System",
  },
  {
    href: "/settings",
    label: "Einstellungen",
    icon: pageVisuals.settings.icon,
    tone: pageVisuals.settings.tone,
  },
  {
    href: "/sync",
    label: "Sync",
    icon: pageVisuals.sync.icon,
    tone: pageVisuals.sync.tone,
    countKey: "pendingCount",
    pendingStyle: true,
  },
];

const travelBuddyItem: NavItem = {
  href: "/trips",
  label: BRAND.travel,
  icon: pageVisuals.trips.icon,
  tone: pageVisuals.trips.tone,
};

const finanzBuddyItem: NavItem = {
  href: "/finance-brain",
  label: BRAND.finance,
  icon: pageVisuals.financeBrain.icon,
  tone: pageVisuals.financeBrain.tone,
};

const accountNavItem: NavItem = {
  href: "/account",
  label: "Konto",
  icon: pageVisuals.account.icon,
  tone: pageVisuals.account.tone,
};

const microsoftNavItem: NavItem = {
  href: "/microsoft",
  label: "Microsoft 365",
  icon: pageVisuals.microsoft.icon,
  logo: <MicrosoftLogo className="size-4" />,
  tone: pageVisuals.microsoft.tone,
  countKey: "mailTriageMicrosoftCount",
  pendingStyle: true,
};

const maringoNavItem: NavItem = {
  href: "/maringo",
  label: "Maringo Support",
  icon: pageVisuals.maringo.icon,
  logo: <MaringoLogo className="size-4" />,
  tone: pageVisuals.maringo.tone,
};

function limitedNavForModules(modules: string[] | undefined): NavItem[] {
  const set = new Set(modules || []);
  const items: NavItem[] = [];
  if (set.has("microsoft")) items.push(microsoftNavItem);
  if (set.has("maringo")) items.push(maringoNavItem);
  if (set.has("travel")) items.push(travelBuddyItem);
  if (set.has("finance")) items.push(finanzBuddyItem);
  items.push(accountNavItem);
  return items;
}

function homeHrefForModules(modules: string[] | undefined): string {
  const set = new Set(modules || []);
  if (set.has("microsoft")) return "/microsoft";
  if (set.has("maringo")) return "/maringo";
  if (set.has("travel")) return "/trips";
  if (set.has("finance")) return "/finance-brain";
  return "/account";
}

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
    label: BRAND.buddy,
    shortLabel: "Buddy",
    description: "Übersicht, Inbox, Dokumente und Wissen",
    icon: pageVisuals.overview.icon,
    tone: pageVisuals.overview.tone,
    href: "/dashboard",
  },
  {
    mode: "travelbuddy",
    label: BRAND.travel,
    shortLabel: "Travel",
    description: "Reisen planen & teilen — nicht nur Belege aus Paperless",
    icon: pageVisuals.trips.icon,
    tone: pageVisuals.trips.tone,
    href: "/trips",
  },
  {
    mode: "finanzbuddy",
    label: BRAND.finance,
    shortLabel: "Finanz",
    description: "Gemeinsame Kasse & Abrechnung — getrennt vom Finanzblick",
    icon: pageVisuals.financeBrain.icon,
    tone: pageVisuals.financeBrain.tone,
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
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  showBadges: boolean;
  isRunning: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const itemPath = item.href.split("?")[0] || item.href;
  const active =
    pathname === itemPath || pathname.startsWith(`${itemPath}/`);
  const analysis = useAnalysis();
  const count =
    showBadges && item.countKey != null
      ? Number(analysis[item.countKey] || 0)
      : null;
  const showCount = count != null && count > 0;
  const linkHref =
    showCount &&
    (item.countKey === "mailTriageGoogleCount" ||
      item.countKey === "mailTriageMicrosoftCount")
      ? `${itemPath}?tab=triage`
      : item.href;
  const Icon = item.icon;

  return (
    <Link
      href={linkHref}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      className={cn(
        "relative flex items-center rounded-lg text-sm font-medium transition-colors",
        collapsed
          ? "justify-center px-2 py-2"
          : "gap-2.5 px-2.5 py-1.5",
        active
          ? "bg-black/10 text-sidebar-foreground"
          : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      {item.logo ? (
        <span className="flex size-4 shrink-0 items-center justify-center">
          {item.logo}
        </span>
      ) : (
        <Icon
          className="size-4 shrink-0"
          strokeWidth={APP_ICON_STROKE}
          absoluteStrokeWidth
          aria-hidden
        />
      )}
      {!collapsed ? (
        <span className="flex-1 text-[14px] font-semibold tracking-tight">
          {item.label}
        </span>
      ) : null}
      {showCount ? (
        <span
          className={cn(
            "font-semibold tabular-nums",
            collapsed
              ? "absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white"
              : cn(
                  "min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[10px]",
                  active
                    ? "bg-red-500 text-white"
                    : item.countKey === "triagePendingCount" ||
                        item.countKey === "mailTriageGoogleCount" ||
                        item.countKey === "mailTriageMicrosoftCount"
                      ? "bg-red-500 text-white"
                      : item.pendingStyle && isRunning
                        ? "bg-amber-500 text-white"
                        : "bg-black/10 text-sidebar-foreground"
                )
          )}
          title={
            item.countKey === "pendingCount"
              ? "Ausstehende Analysen"
              : item.countKey === "urgentDeadlinesCount"
                ? "Dringende Fristen"
                : item.countKey === "warrantiesExpiringSoon"
                  ? "Garantien bald ablaufend"
                  : item.countKey === "openDueFinanceCount"
                    ? "Offene Rechnungen"
                    : item.countKey === "triagePendingCount"
                      ? "Inbox / Triage"
                      : item.countKey === "mailTriageGoogleCount"
                        ? "Google Mail-Triage"
                        : item.countKey === "mailTriageMicrosoftCount"
                          ? "Microsoft Mail-Triage"
                          : undefined
          }
        >
          {collapsed
            ? count! > 9
              ? "9+"
              : formatCount(count!)
            : formatCount(count!)}
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
  /** Mobile drawer stays expanded; desktop can collapse to icon rail. */
  const [collapsedPref, setCollapsedPref] = useState(false);
  const collapsed = Boolean(collapsedPref && !onNavigate);

  useEffect(() => {
    try {
      setCollapsedPref(
        window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"
      );
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsedPref((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const brandTitle = BRAND.app;
  const brandHref = isLimitedUser
    ? homeHrefForModules(me?.modules)
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
    listItems = limitedNavForModules(me?.modules);
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
        "relative flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
        collapsed ? "w-[4.25rem]" : "w-60",
        className
      )}
      data-collapsed={collapsed ? "true" : "false"}
    >
      {!onNavigate ? (
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
          aria-expanded={!collapsed}
          aria-label={
            collapsed ? "Navigation ausklappen" : "Navigation einklappen"
          }
          className={cn(
            "absolute z-10 flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed ? "top-3 right-2.5" : "top-3.5 right-3.5"
          )}
        >
          {collapsed ? (
            <ChevronsRight className="size-4" strokeWidth={2} aria-hidden />
          ) : (
            <ChevronsLeft className="size-4" strokeWidth={2} aria-hidden />
          )}
        </button>
      ) : null}
      <div
        className={cn(
          collapsed ? "px-2 py-4" : "px-5 py-6",
          !onNavigate && (collapsed ? "pt-11" : "pr-12")
        )}
      >
        <button
          type="button"
          className={cn(
            "flex w-full items-center text-left",
            collapsed ? "justify-center" : "gap-3"
          )}
          title={brandTitle}
          onClick={() => {
            if (isAdminNav) {
              handleGoHome();
              return;
            }
            router.push(brandHref);
            onNavigate?.();
          }}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center",
              collapsed ? "h-10 w-10" : "h-14 w-14"
            )}
          >
            <BuddyLogo
              size={collapsed ? 40 : 56}
              className={cn(
                "drop-shadow-md",
                collapsed ? "h-10 w-10" : "h-14 w-14"
              )}
              priority
            />
          </span>
          {!collapsed ? (
            <span className="text-3xl font-extrabold leading-none tracking-tight text-sidebar-foreground">
              {brandTitle}
            </span>
          ) : null}
        </button>
        {me ? (
          <div
            className={cn(
              "mt-4 flex items-center rounded-xl bg-black/5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]",
              collapsed
                ? "justify-center px-1.5 py-2"
                : "gap-2.5 px-3 py-2.5"
            )}
            title={collapsed ? `Angemeldet als ${me.displayName}` : undefined}
          >
            <UserAvatar
              name={me.displayName}
              src={me.avatarUrl}
              size={collapsed ? "sm" : "md"}
              className="ring-slate-400/40"
            />
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium leading-none text-sidebar-foreground/65">
                  Angemeldet als:
                </p>
                <p
                  className="mt-1.5 truncate text-sm font-semibold tracking-tight text-sidebar-foreground"
                  title={me.displayName}
                >
                  {me.displayName}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {showAreaSwitcher ? (
        <div
          className={cn("space-y-2 pb-3", collapsed ? "px-1.5" : "px-3")}
        >
          <button
            type="button"
            onClick={handleGoHome}
            title={`Zurück zu ${BRAND.app}`}
            className={cn(
              "flex w-full items-center rounded-lg text-xs font-semibold text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed
                ? "justify-center px-2 py-2"
                : "gap-2 px-3 py-2"
            )}
          >
            <ArrowLeft className="size-3.5 shrink-0" />
            {!collapsed ? <>Zurück zu {BRAND.app}</> : null}
          </button>
          <div
            className={cn(
              "rounded-xl bg-black/5 p-1",
              collapsed ? "flex flex-col gap-1" : "grid grid-cols-3 gap-1"
            )}
          >
            {areaEntries.map((entry) => {
              const active = mode === entry.mode;
              return (
                <button
                  key={entry.mode}
                  type="button"
                  title={entry.label}
                  onClick={() => selectArea(entry)}
                  className={cn(
                    "flex items-center justify-center rounded-lg transition-colors",
                    collapsed
                      ? "px-2 py-2"
                      : "flex-col gap-1 px-1 py-2 text-[10px] font-semibold leading-tight",
                    active
                      ? "bg-black/10 text-sidebar-foreground shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-black/5 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <entry.icon
                    className="size-4"
                    strokeWidth={APP_ICON_STROKE}
                    absoluteStrokeWidth
                    aria-hidden
                  />
                  {!collapsed ? (
                    <span className="truncate">{entry.shortLabel}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <nav
        className={cn(
          "min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-3",
          collapsed ? "px-1.5" : "px-3"
        )}
      >
        {isAdminNav && mode === "home" ? (
          <div className="space-y-1.5 pt-0.5">
            {!collapsed ? (
              <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
                Bereiche
              </p>
            ) : null}
            {areaEntries.map((entry) => (
              <button
                key={entry.mode}
                type="button"
                title={entry.label}
                onClick={() => selectArea(entry)}
                className={cn(
                  "flex w-full rounded-xl bg-black/[0.03] text-left transition-colors hover:bg-black/5",
                  collapsed
                    ? "items-center justify-center px-2 py-2.5"
                    : "items-start gap-3 px-3 py-3"
                )}
              >
                <entry.icon
                  className={cn(
                    "shrink-0 text-sidebar-foreground",
                    collapsed ? "size-5" : "mt-0.5 size-5"
                  )}
                  strokeWidth={APP_ICON_STROKE}
                  absoluteStrokeWidth
                  aria-hidden
                />
                {!collapsed ? (
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold tracking-tight text-sidebar-foreground">
                      {entry.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-sidebar-foreground/65">
                      {entry.description}
                    </span>
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          listItems.map((item, index) => {
            const prev = listItems[index - 1];
            const showSection =
              !collapsed &&
              Boolean(item.section) &&
              item.section !== prev?.section;
            return (
              <Fragment key={item.href}>
                {showSection ? (
                  <p
                    className={cn(
                      "px-2.5 pb-0 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/55",
                      index === 0 ? "pt-0.5" : "pt-1.5"
                    )}
                  >
                    {item.section}
                  </p>
                ) : null}
                <NavLinkRow
                  item={item}
                  pathname={pathname}
                  showBadges={!isLimitedUser}
                  isRunning={isRunning}
                  onNavigate={onNavigate}
                  collapsed={collapsed}
                />
              </Fragment>
            );
          })
        )}
      </nav>

      <div
        className={cn(
          "mt-auto space-y-2 border-t border-sidebar-border/60 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
          collapsed ? "px-1.5" : "px-4"
        )}
      >
        <button
          type="button"
          title="Abmelden"
          className={cn(
            "flex min-h-11 w-full items-center rounded-xl text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
          )}
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" }).catch(
              () => undefined
            );
            window.location.assign("/login");
          }}
        >
          <LogOut className="size-4" />
          {!collapsed ? "Abmelden" : null}
        </button>
        {!collapsed ? (
          <p
            className="font-mono text-[10px] tabular-nums tracking-wide text-sidebar-foreground/50"
            title="App-Version (Datum-Uhrzeit des letzten Commits)"
          >
            {APP_VERSION}
          </p>
        ) : (
          <p
            className="truncate px-0.5 text-center font-mono text-[8px] tabular-nums text-sidebar-foreground/40"
            title={APP_VERSION}
          >
            {APP_VERSION.slice(-4)}
          </p>
        )}
      </div>
    </aside>
  );
}
