import { cn } from "@/lib/utils";
import type { IconTone } from "@/components/layout/icon-circle";

const chipActive: Record<string, string> = {
  primary: "border-transparent bg-primary text-primary-foreground",
  teal: "border-transparent bg-[var(--brand-docs)] text-white",
  green: "border-transparent bg-[var(--brand-finance)] text-white",
  slate: "border-transparent bg-[var(--brand-settings)] text-white",
};

const chipIdle: Record<string, string> = {
  primary: "border-primary/40 bg-transparent text-primary",
  teal: "border-[var(--brand-docs)]/45 bg-transparent text-[var(--brand-docs)]",
  green:
    "border-[var(--brand-finance)]/45 bg-transparent text-[var(--brand-finance)]",
  slate:
    "border-[var(--brand-settings)]/45 bg-transparent text-[var(--brand-settings)]",
};

const fabTone: Record<string, string> = {
  primary: "bg-primary text-primary-foreground shadow-primary/25",
  teal: "bg-[var(--brand-docs)] text-white shadow-[var(--brand-docs)]/25",
  green:
    "bg-[var(--brand-finance)] text-white shadow-[var(--brand-finance)]/25",
  slate:
    "bg-[var(--brand-settings)] text-white shadow-[var(--brand-settings)]/25",
};

export function FilterChip({
  active,
  accent = "teal",
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  active?: boolean;
  accent?: IconTone | "primary";
}) {
  const key =
    accent === "teal" ||
    accent === "green" ||
    accent === "slate" ||
    accent === "primary"
      ? accent
      : "primary";

  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active ? chipActive[key] : chipIdle[key],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SoftFab({
  accent = "teal",
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  accent?: IconTone | "primary";
  label?: string;
}) {
  const key =
    accent === "teal" ||
    accent === "green" ||
    accent === "slate" ||
    accent === "primary"
      ? accent
      : "primary";

  return (
    <div className="pointer-events-none fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-1 md:hidden">
      <button
        type="button"
        className={cn(
          "pointer-events-auto flex size-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95",
          fabTone[key],
          className
        )}
        {...props}
      >
        {children}
      </button>
      {label ? (
        <span className="pointer-events-none text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
      ) : null}
    </div>
  );
}
