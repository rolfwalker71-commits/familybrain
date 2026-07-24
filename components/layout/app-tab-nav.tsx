"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IconTone } from "@/components/layout/icon-circle";

export type AppTabItem<T extends string = string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  /** Emphasize this tab as a primary action (e.g. Neu). */
  emphasize?: boolean;
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

const accentPill: Record<IconTone | "primary", string> = {
  primary: "bg-primary/12",
  teal: "bg-[var(--brand-docs-soft)]",
  green: "bg-[var(--brand-finance-soft)]",
  slate: "bg-[var(--brand-settings-soft)]",
  blue: "bg-blue-50",
  amber: "bg-amber-50",
  rose: "bg-rose-50",
  orange: "bg-orange-50",
  sky: "bg-sky-50",
  indigo: "bg-indigo-50",
  violet: "bg-violet-50",
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
}: {
  items: AppTabItem<T>[];
  active: T;
  onChange: (tab: T) => void;
  className?: string;
  /** Show bottom bar on all breakpoints (e.g. share mobile pages). */
  alwaysBottom?: boolean;
  /** Domain accent for the active soft-pill. */
  accent?: IconTone | "primary";
}) {
  const activeText = accentActive[accent];
  const activePill = accentPill[accent];
  const solid = accentSolid[accent];

  return (
    <>
      <div
        className={cn(
          alwaysBottom
            ? "hidden"
            : "hidden flex-wrap gap-1 rounded-2xl border border-border/60 bg-muted/50 p-1 md:flex",
          className
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? cn("bg-card shadow-sm", activeText)
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>

      <nav
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-30",
          !alwaysBottom && "md:hidden",
          className
        )}
        aria-label="Bereiche"
      >
        <div className="pointer-events-auto mx-3 mb-[max(0.5rem,env(safe-area-inset-bottom))] rounded-[1.35rem] border border-border/50 bg-card/95 px-1.5 pt-1.5 pb-1.5 shadow-[0_8px_32px_rgba(20,32,28,0.12)] backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === active;
              const isEmphasize = Boolean(item.emphasize);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChange(item.id)}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1 text-[10px] font-medium transition-colors",
                    isActive ? activeText : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-xl transition-colors",
                      isEmphasize && !isActive && solid,
                      isEmphasize && isActive && solid,
                      !isEmphasize && isActive && activePill,
                      !isEmphasize && !isActive && "bg-transparent"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4",
                        isEmphasize && "text-inherit"
                      )}
                    />
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
