"use client";

import { cn } from "@/lib/utils";

const SIZE = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-12 text-sm",
} as const;

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export function UserAvatar({
  name,
  src,
  size = "sm",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const dim = SIZE[size];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn(
          "shrink-0 rounded-full object-cover ring-1 ring-border/60",
          dim,
          className
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-finance-soft)] font-bold text-[var(--brand-finance)] ring-1 ring-[var(--brand-finance)]/20",
        dim,
        className
      )}
      aria-hidden
    >
      {initialsFromName(name)}
    </span>
  );
}

export function NameWithAvatar({
  name,
  src,
  size = "sm",
  className,
  nameClassName,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <UserAvatar name={name} src={src} size={size} />
      <span className={cn("truncate", nameClassName)}>{name}</span>
    </span>
  );
}
