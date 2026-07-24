"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Primary entity name / vendor — always bold, wraps instead of clipping. */
export function VendorText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("font-semibold text-foreground break-words", className)}>
      {children || "–"}
    </div>
  );
}

export function SoftText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  if (children == null || children === "") return null;
  return (
    <div className={cn("mt-0.5 text-xs text-muted-foreground break-words", className)}>
      {children}
    </div>
  );
}

export function MetaLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ActionCluster({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-start gap-2 sm:justify-end",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Hybrid list row:
 * - Mobile: stacked card fields
 * - md+: horizontal row that wraps instead of truncating
 */
export function DataList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-3 md:gap-0 md:divide-y md:divide-border/70 md:p-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DataListRow({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card p-3.5 shadow-[0_4px_16px_rgba(20,32,28,0.05)] transition-colors hover:bg-muted/30 md:rounded-none md:border-0 md:bg-transparent md:px-4 md:py-3 md:shadow-none",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function DataListMain({
  title,
  subtitle,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-start md:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="font-semibold text-foreground break-words">{title}</div>
        {subtitle ? (
          <div className="text-sm text-foreground/90 break-words">{subtitle}</div>
        ) : null}
        {meta ? <div className="pt-0.5">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="shrink-0 md:pl-4">
          <ActionCluster>{actions}</ActionCluster>
        </div>
      ) : null}
    </div>
  );
}

export function DataListHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-4 py-1.5">
      <div className="flex min-h-8 min-w-0 items-center">
        <h3 className="text-[16px] font-bold leading-none text-foreground">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
