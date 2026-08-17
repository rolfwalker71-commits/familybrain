"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TimeBucketDef } from "@/lib/utils/time-buckets";

const ACCENT: Record<TimeBucketDef["accent"], string> = {
  red: "text-red-800",
  orange: "text-orange-800",
  amber: "text-amber-900",
  muted: "text-foreground",
};

/** Collapsible horizon section for long deadline / warranty lists. */
export function TimeBucketSection({
  title,
  accent,
  defaultOpen,
  countLabel,
  children,
}: {
  title: string;
  accent: TimeBucketDef["accent"];
  defaultOpen: boolean;
  countLabel?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="min-w-0 overflow-hidden border-b border-border/60 last:border-b-0 md:border-border/70">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        className="flex h-auto w-full items-center gap-2 bg-muted/40 px-3 py-2.5 text-left md:px-4"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90"
          )}
        />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-bold", ACCENT[accent])}>{title}</p>
          {countLabel ? (
            <p className="text-xs text-muted-foreground">{countLabel}</p>
          ) : null}
        </div>
      </Button>
      {open ? <div>{children}</div> : null}
    </section>
  );
}
