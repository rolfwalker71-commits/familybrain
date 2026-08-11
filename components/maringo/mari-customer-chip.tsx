import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Kundename fett, ohne Chip-Hintergrund. */
export function MariCustomerChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block max-w-full truncate font-bold text-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}
