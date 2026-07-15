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

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="w-full overflow-x-auto">{children}</div>
    </div>
  );
}
