import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Kundename als farbiger Chip — etwas grösser als umgebender Text. */
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
        "inline-flex max-w-full items-center truncate rounded-full bg-sky-100 px-2 py-0.5 text-[length:calc(1em+2px)] font-bold leading-none text-sky-950",
        className
      )}
    >
      {children}
    </span>
  );
}
