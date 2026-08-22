"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type SpeedDialAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
};

/**
 * Floating action button with speed-dial.
 * Sits above the PWA/mobile bottom tab bar; lower on desktop.
 */
export function SpeedDialFab({
  actions,
  accent = "finance",
  className,
  label = "Hinzufügen",
}: {
  actions: SpeedDialAction[];
  accent?: "travel" | "finance";
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (actions.length === 0) return null;

  const solid =
    accent === "travel"
      ? "bg-sky-600 text-white hover:bg-sky-600/90"
      : "bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90";

  return (
    <div
      className={cn(
        // Above bottom tab bar on mobile/PWA; corner on desktop
        "pointer-events-none fixed z-40 flex flex-col items-end gap-2",
        "right-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:right-6 md:bottom-6",
        className
      )}
    >
      {open ? (
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                type="button"
                variant="outline"
                className="flex h-auto w-auto items-center gap-2 rounded-full border-border/70 bg-card py-1.5 pl-3 pr-2 text-sm font-medium shadow-md"
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
              >
                <span>{action.label}</span>
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full",
                    solid
                  )}
                >
                  <Icon className="size-4" />
                </span>
              </Button>
            );
          })}
        </div>
      ) : null}

      <Button
        type="button"
        variant="default"
        size="icon-lg"
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "pointer-events-auto size-14 rounded-full shadow-lg transition-transform",
          solid,
          open && "rotate-45"
        )}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X className="size-6" /> : <Plus className="size-6" />}
      </Button>
    </div>
  );
}

export function SoftChipRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SoftChip({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[0.6875rem] font-medium text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}
