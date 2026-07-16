import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconCircle, type IconTone } from "@/components/layout/icon-circle";

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
        {icon ? <IconCircle icon={icon} tone={tone} size="lg" /> : null}
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-semibold tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
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
 * Uses muted gray (darker than page background) so headings stand out.
 *
 * The bar itself is pointer-events-none so parent `<button>` / Link clicks work.
 * Set `interactiveTrailing` when trailing contains real controls (e.g. calendar).
 */
export function TileTitleBar({
  children,
  trailing,
  className,
  interactiveTrailing = false,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
  interactiveTrailing?: boolean;
}) {
  return (
    <div
      className={cn(
        // Always pass clicks through to a parent <button>/Link; only
        // interactive trailing controls re-enable pointer events.
        "pointer-events-none flex w-full items-center justify-between gap-3 border-b border-border bg-muted px-4 py-2.5",
        className
      )}
    >
      <div className="min-w-0 flex-1 text-[19px] font-bold text-foreground">
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
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border-2 border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_14px_rgba(15,23,42,0.08)]",
        className
      )}
    >
      <TileTitleBar
        trailing={icon ? <IconCircle icon={icon} tone={tone} size="sm" /> : undefined}
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

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border-2 border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_14px_rgba(15,23,42,0.08)]">
      <div className="w-full overflow-x-auto">{children}</div>
    </div>
  );
}
