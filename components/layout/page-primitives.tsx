import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  IconCircle,
  toneSurface,
  type IconTone,
} from "@/components/layout/icon-circle";

/** Prefer wrapping over clipping. Title remains for hover context. */
export function TruncateText({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const text =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : title;

  return (
    <span className={cn("block break-words", className)} title={text}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon,
  tone = "blue",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
  tone?: IconTone;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <IconCircle icon={icon} tone={tone} size="lg" className="rounded-xl" />
        ) : null}
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function FilterGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {children}
    </div>
  );
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}

export function CardGrid({
  children,
  cols = 3,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 xl:grid-cols-3",
        cols === 4 && "sm:grid-cols-2 xl:grid-cols-4"
      )}
    >
      {children}
    </div>
  );
}

/**
 * Full-bleed title bar for tiles / group headers.
 *
 * The bar itself is pointer-events-none so parent `<button>` / Link clicks work.
 * Set `interactiveTrailing` when trailing contains real controls (e.g. calendar).
 */
export function TileTitleBar({
  children,
  trailing,
  className,
  tone = "slate",
  interactiveTrailing = false,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
  tone?: IconTone;
  interactiveTrailing?: boolean;
}) {
  const surface = toneSurface(tone);
  return (
    <div
      className={cn(
        // Always pass clicks through to a parent <button>/Link; only
        // interactive trailing controls re-enable pointer events.
        "pointer-events-none flex w-full items-center justify-between gap-3 border-b px-4 py-1.5",
        surface.title,
        className
      )}
    >
      <div className="flex min-h-8 min-w-0 flex-1 items-center text-[16px] font-bold leading-none">
        {children}
      </div>
      {trailing ? (
        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            interactiveTrailing && "pointer-events-auto"
          )}
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

/** Small KPI / metric tile used on dashboard, finance, travel, etc. */
export function MetricTile({
  title,
  value,
  subtitle,
  icon,
  tone = "blue",
  className,
}: {
  title: ReactNode;
  value: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  tone?: IconTone;
  className?: string;
}) {
  const surface = toneSurface(tone);
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]",
        surface.body,
        className
      )}
    >
      <TileTitleBar
        tone={tone}
        trailing={
          icon ? <IconCircle icon={icon} tone={tone} size="sm" /> : undefined
        }
      >
        {title}
      </TileTitleBar>
      <div className="p-4">
        <div className="break-words text-2xl font-semibold tabular-nums text-foreground">
          {value}
        </div>
        {subtitle ? (
          <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}

export function TableShell({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: IconTone;
}) {
  const surface = toneSurface(tone);
  return (
    <div
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-xl border border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]",
        surface.body
      )}
    >
      <div className="w-full overflow-x-auto">{children}</div>
    </div>
  );
}
