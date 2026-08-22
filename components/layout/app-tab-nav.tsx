"use client";

import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IconTone } from "@/components/layout/icon-circle";
import { SEGMENTED_TRACK, SEGMENTED_TRIGGER } from "@/components/layout/segmented";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AppTabItem<T extends string = string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  /** Emphasize this tab as a primary action (e.g. Neu). */
  emphasize?: boolean;
};

/** Overflow / secondary actions behind «…» (desktop + PWA bottom bar). */
export type AppTabOverflowItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Highlight «…» when this secondary surface is active. */
  active?: boolean;
};

const accentActive: Record<IconTone | "primary", string> = {
  primary: "text-primary",
  teal: "text-[var(--brand-docs)]",
  green: "text-[var(--brand-finance)]",
  slate: "text-[var(--brand-settings)]",
  blue: "text-blue-600",
  amber: "text-amber-600",
  rose: "text-rose-500",
  orange: "text-orange-600",
  sky: "text-sky-600",
  indigo: "text-indigo-600",
  violet: "text-violet-600",
};

const accentSolid: Record<IconTone | "primary", string> = {
  primary: "bg-primary text-primary-foreground",
  teal: "bg-[var(--brand-docs)] text-white",
  green: "bg-[var(--brand-finance)] text-white",
  slate: "bg-[var(--brand-settings)] text-white",
  blue: "bg-blue-600 text-white",
  amber: "bg-amber-600 text-white",
  rose: "bg-rose-500 text-white",
  orange: "bg-orange-600 text-white",
  sky: "bg-sky-600 text-white",
  indigo: "bg-indigo-600 text-white",
  violet: "bg-violet-600 text-white",
};

export function AppTabNav<T extends string>({
  items,
  active,
  onChange,
  className,
  alwaysBottom = false,
  accent = "primary",
  overflowItems,
}: {
  items: AppTabItem<T>[];
  active: T;
  onChange: (tab: T) => void;
  className?: string;
  /** Show bottom bar on all breakpoints (e.g. share mobile pages). */
  alwaysBottom?: boolean;
  /** Domain accent for the active soft-pill. */
  accent?: IconTone | "primary";
  /** Secondary actions in «…» — keep primary row ≤4 for PWA thumb reach. */
  overflowItems?: AppTabOverflowItem[];
}) {
  const activeText = accentActive[accent];
  const solid = accentSolid[accent];
  const hasOverflow = Boolean(overflowItems && overflowItems.length > 0);
  const overflowActive = Boolean(overflowItems?.some((o) => o.active));

  function renderOverflowTrigger(variant: "desktop" | "mobile") {
    if (!hasOverflow || !overflowItems) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className={
                variant === "desktop"
                  ? cn(
                      SEGMENTED_TRIGGER,
                      "inline-flex text-sm font-medium",
                      overflowActive
                        ? cn("bg-card shadow-sm", activeText)
                        : "text-muted-foreground hover:text-foreground"
                    )
                  : cn(
                      "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-xs font-bold leading-snug tracking-tight",
                      overflowActive ? "text-foreground" : "text-foreground/55"
                    )
              }
              aria-label="Weitere Aktionen"
            />
          }
        >
          {variant === "desktop" ? (
            <MoreHorizontal className="size-4 shrink-0" />
          ) : (
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-lg transition-colors",
                overflowActive && "bg-foreground/8"
              )}
            >
              <MoreHorizontal
                className="size-5 stroke-[2.75] text-foreground"
                absoluteStrokeWidth
              />
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side={variant === "mobile" ? "top" : "bottom"}
          sideOffset={variant === "mobile" ? 10 : 4}
          className="min-w-48"
        >
          {overflowItems.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem
                key={item.id}
                onClick={() => item.onSelect()}
                className={cn(item.active && activeText)}
              >
                <Icon className="size-4" />
                {item.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <div
        data-app-tab-nav=""
        data-segmented=""
        className={cn(
          alwaysBottom ? "hidden" : "hidden md:flex",
          SEGMENTED_TRACK,
          className
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              onClick={() => onChange(item.id)}
              className={cn(
                SEGMENTED_TRIGGER,
                "inline-flex text-sm font-medium",
                isActive
                  ? cn("bg-card shadow-sm", activeText)
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Button>
          );
        })}
        {renderOverflowTrigger("desktop")}
      </div>

      <nav
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-30",
          !alwaysBottom && "md:hidden",
          className
        )}
        aria-label="Bereiche"
      >
        <div className="pointer-events-auto mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] rounded-2xl border border-border/60 bg-card px-1.5 pt-1.5 pb-1.5 shadow-[0_8px_32px_rgba(20,32,28,0.14)]">
          <div
            data-app-tab-nav=""
            className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5"
          >
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === active;
              const isEmphasize = Boolean(item.emphasize);

              return (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  onClick={() => onChange(item.id)}
                  className={cn(
                    "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-xs font-bold leading-snug tracking-tight",
                    isEmphasize
                      ? "text-foreground"
                      : isActive
                        ? "text-foreground"
                        : "text-foreground/55"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl transition-colors",
                      isEmphasize && solid,
                      !isEmphasize && isActive && "bg-muted",
                      !isEmphasize && !isActive && "bg-transparent"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-5 stroke-[2.75]",
                        isEmphasize ? "text-inherit" : "text-foreground"
                      )}
                      absoluteStrokeWidth
                    />
                  </span>
                  <span className="max-w-full text-center leading-snug break-words [overflow-wrap:anywhere] line-clamp-2">
                    {item.label}
                  </span>
                </Button>
              );
            })}
            {renderOverflowTrigger("mobile")}
          </div>
        </div>
      </nav>
    </>
  );
}
