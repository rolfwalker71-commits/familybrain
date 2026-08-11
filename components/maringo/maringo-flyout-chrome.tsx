"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarClock,
  Clock3,
  MessageSquare,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";

export type MariSecondaryFlyoutId =
  | "verlauf"
  | "buchungen"
  | "arbeitszeit";

export const MARI_SECONDARY_FLYOUT_META: Record<
  MariSecondaryFlyoutId,
  { label: string; short: string }
> = {
  verlauf: { label: "Verlauf", short: "Verlauf" },
  buchungen: { label: "Ticket-Buchungen", short: "Buchungen" },
  arbeitszeit: { label: "Arbeitszeit", short: "Zeit" },
};

/** Slide-in duration for main + secondary flyouts (ms). */
export const MARI_FLYOUT_ENTER_MS = 1500;

/** Toggle / bring-to-front / close-if-top for the secondary stack. */
export function toggleMariSecondaryFlyout(
  stack: MariSecondaryFlyoutId[],
  id: MariSecondaryFlyoutId
): MariSecondaryFlyoutId[] {
  const idx = stack.indexOf(id);
  if (idx === -1) return [...stack, id];
  if (idx === stack.length - 1) return stack.slice(0, -1);
  return [...stack.filter((x) => x !== id), id];
}

function useFlyoutEnter(open = true) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    setEntered(false);
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEntered(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);
  return entered;
}

export function MariTicketFlyoutRail({
  openIds,
  onToggle,
}: {
  openIds: readonly MariSecondaryFlyoutId[];
  onToggle: (id: MariSecondaryFlyoutId) => void;
}) {
  const items: {
    id: MariSecondaryFlyoutId;
    icon: typeof MessageSquare;
    label: string;
  }[] = [
    { id: "verlauf", icon: MessageSquare, label: "Verlauf" },
    { id: "buchungen", icon: Clock3, label: "Buchungen" },
    { id: "arbeitszeit", icon: CalendarClock, label: "Arbeitszeit" },
  ];

  return (
    <nav
      className="flex w-11 shrink-0 flex-col gap-1 border-r border-border/60 bg-muted/25 px-1 py-2"
      aria-label="Ticket-Nebenbereiche"
    >
      {items.map(({ id, icon: Icon, label }) => {
        const active = openIds.includes(id);
        const top = openIds[openIds.length - 1] === id;
        return (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={() => onToggle(id)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-lg px-0.5 py-1.5 text-[9px] font-semibold leading-tight transition-colors",
              top
                ? "bg-orange-100 text-orange-950"
                : active
                  ? "bg-orange-50 text-orange-900"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Icon className="size-4" strokeWidth={APP_ICON_STROKE} />
            <span className="max-w-full truncate px-0.5">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function MariMainFlyoutShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const entered = useFlyoutEnter(true);
  return (
    <div
      className={cn(
        "absolute inset-y-0 right-0 z-[1001] flex h-full w-[min(100%,42rem)] max-w-full overflow-hidden rounded-l-2xl border-l border-border/70 bg-background shadow-[-12px_0_32px_rgba(15,23,42,0.12)] transition-transform ease-out will-change-transform",
        entered ? "translate-x-0" : "translate-x-full",
        className
      )}
      style={{ transitionDuration: `${MARI_FLYOUT_ENTER_MS}ms` }}
    >
      {children}
    </div>
  );
}

export function MariSecondaryFlyoutShell({
  title,
  description,
  onClose,
  widthClass,
  zIndex,
  offsetPx,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  widthClass: string;
  zIndex: number;
  offsetPx: number;
  children: ReactNode;
}) {
  const entered = useFlyoutEnter(true);
  return (
    <aside
      className={cn(
        "pointer-events-auto absolute inset-y-0 flex flex-col overflow-hidden rounded-l-2xl border-l border-border/70 bg-background shadow-[-8px_0_24px_rgba(15,23,42,0.08)] transition-transform ease-out will-change-transform",
        entered ? "translate-x-0" : "translate-x-full",
        widthClass
      )}
      style={{
        right: offsetPx,
        zIndex,
        transitionDuration: `${MARI_FLYOUT_ENTER_MS}ms`,
      }}
      role="dialog"
      aria-modal="false"
      aria-label={title}
    >
      <div className="flex shrink-0 items-start gap-2 border-b border-border/60 px-3 py-2.5 pr-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black tracking-tight">{title}</p>
          {description ? (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          onClick={onClose}
          aria-label="Schliessen"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {children}
      </div>
    </aside>
  );
}
