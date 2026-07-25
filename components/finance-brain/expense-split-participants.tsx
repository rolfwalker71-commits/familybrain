"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Member = { id: number; display_name: string };

/**
 * Checkbox list: who shares this expense equally.
 * Empty selection is invalid for submit (caller should guard).
 */
export function ExpenseSplitParticipants({
  members,
  selectedIds,
  onChange,
  compact,
  className,
}: {
  members: Member[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  compact?: boolean;
  className?: string;
}) {
  const selected = new Set(selectedIds);
  const allSelected =
    members.length > 0 && members.every((m) => selected.has(m.id));

  function toggle(id: number) {
    if (selected.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function selectAll() {
    onChange(members.map((m) => m.id));
  }

  if (members.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className={compact ? "text-xs" : undefined}>
          Beteiligt (gleicher Anteil)
        </Label>
        <button
          type="button"
          className="text-[11px] font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
          onClick={() => (allSelected ? onChange([]) : selectAll())}
        >
          {allSelected ? "Keine" : "Alle"}
        </button>
      </div>
      <div
        className={cn(
          "grid gap-1.5 rounded-lg border border-border/60 bg-background/50 p-2",
          members.length > 2 ? "sm:grid-cols-2" : "grid-cols-1"
        )}
      >
        {members.map((m) => {
          const checked = selected.has(m.id);
          return (
            <label
              key={m.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50",
                checked && "bg-[var(--brand-finance-soft)]/50"
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(m.id)}
                className="size-4 accent-[var(--brand-finance)]"
              />
              <span className="min-w-0 truncate font-medium">
                {m.display_name}
              </span>
            </label>
          );
        })}
      </div>
      {selectedIds.length === 0 ? (
        <p className="text-[11px] text-rose-600">
          Mindestens eine Person wählen.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Betrag wird durch {selectedIds.length} geteilt
          {selectedIds.length === members.length ? " (ganze Gruppe)" : ""}.
        </p>
      )}
    </div>
  );
}
