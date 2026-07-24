"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppTabItem<T extends string = string> = {
  id: T;
  label: string;
  icon: LucideIcon;
};

export function AppTabNav<T extends string>({
  items,
  active,
  onChange,
  className,
  alwaysBottom = false,
}: {
  items: AppTabItem<T>[];
  active: T;
  onChange: (tab: T) => void;
  className?: string;
  /** Show bottom bar on all breakpoints (e.g. share mobile pages). */
  alwaysBottom?: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          alwaysBottom
            ? "hidden"
            : "hidden flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/40 p-1 md:flex",
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
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
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
        <div className="pointer-events-auto border-t border-border/80 bg-background/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.1)] backdrop-blur">
          <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChange(item.id)}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] font-medium transition-colors",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full",
                      isActive ? "bg-foreground/10" : "bg-transparent"
                    )}
                  >
                    <Icon className="size-4" />
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
