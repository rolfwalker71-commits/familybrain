"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import type { MariKeyPair } from "@/lib/mari/timekeeping-shared";

function formatKeyPair(row: MariKeyPair): string {
  return [row.keyVisible, row.matchcode].filter(Boolean).join(" · ");
}

/** Wide popup for long MARI labels (contracts / positions) — native select truncates. */
export function MariKeyPairPicker({
  id,
  label,
  value,
  options,
  placeholder,
  emptyLabel,
  disabled,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  options: MariKeyPair[];
  placeholder: string;
  emptyLabel?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.keyInternal === value);
  const display = selected
    ? formatKeyPair(selected)
    : options.length === 0
      ? emptyLabel || placeholder
      : value
        ? value
        : placeholder;

  return (
    <div ref={rootRef} className="relative space-y-1">
      <Label htmlFor={fieldId}>{label}</Label>
      <Button
        id={fieldId}
        type="button"
        variant="outline"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "h-9 w-full justify-between gap-2 px-3 text-left text-sm font-normal",
          disabled && "cursor-not-allowed opacity-50"
        )}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        <span className="min-w-0 truncate" title={display}>
          {display}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={APP_ICON_STROKE}
          aria-hidden
        />
      </Button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 z-40 mt-1 max-h-64 w-max min-w-full max-w-[min(42rem,calc(100vw-1.5rem))] overflow-auto rounded-lg border border-border bg-background py-1 shadow-lg"
        >
          <li role="option" aria-selected={!value}>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "h-auto w-full justify-start px-2.5 py-1.5 text-left text-xs font-normal hover:bg-muted",
                !value && "bg-muted/60 font-medium"
              )}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {options.length === 0 ? emptyLabel || placeholder : placeholder}
            </Button>
          </li>
          {options.map((o) => {
            const text = formatKeyPair(o);
            const active = o.keyInternal === value;
            return (
              <li key={o.keyInternal} role="option" aria-selected={active}>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-auto w-full justify-start whitespace-nowrap px-2.5 py-1.5 text-left text-xs font-normal hover:bg-muted",
                    active && "bg-muted font-medium"
                  )}
                  title={text}
                  onClick={() => {
                    onChange(o.keyInternal);
                    setOpen(false);
                  }}
                >
                  {text}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
