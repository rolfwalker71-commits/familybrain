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
    <div className={cn("font-semibold text-foreground wrap-break-word", className)}>
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
    <div className={cn("mt-0.5 text-xs text-muted-foreground wrap-break-word", className)}>
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
/** Detached list card chrome — same inset / radius / hairline as agenda rows. */
export const LIST_CARD =
  "rounded-2xl bg-card shadow-[0_2px_10px_rgba(20,32,28,0.04)] ring-1 ring-border/50";

export function DataList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-3", className)}>
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
        "w-full min-w-0 p-3.5 transition-colors hover:bg-muted",
        LIST_CARD,
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
  leading,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  /** Optional left visual (e.g. document AI icon). */
  leading?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 gap-3",
        className
      )}
    >
      {leading ? (
        <div className="shrink-0 self-start pt-0.5">{leading}</div>
      ) : null}
      <div className="flex w-full min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 w-full flex-1 space-y-1.5 overflow-hidden">
          <div className="font-semibold text-foreground wrap-break-word">
            {title}
          </div>
          {subtitle ? (
            <div className="text-sm text-foreground/90 wrap-break-word">
              {subtitle}
            </div>
          ) : null}
          {meta ? <div className="min-w-0 pt-0.5">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="w-full shrink-0 sm:w-auto sm:pl-4">
            <ActionCluster>{actions}</ActionCluster>
          </div>
        ) : null}
      </div>
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
        <h3 className="text-base font-bold leading-none text-foreground">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
