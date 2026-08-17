"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Member = { id: number; display_name: string };
type Couple = { id: number; name: string; memberIds: number[] };

export type ExpenseSplitSelection =
  | { mode: "equal"; memberIds: number[] }
  | { mode: "coupleEqual"; coupleIds: number[] };

/** Members who may be payer given the current Beteiligung selection. */
export function eligiblePayerIdsFromSplit(
  split: ExpenseSplitSelection,
  couples: Couple[],
  members: Member[]
): number[] {
  const memberSet = new Set(members.map((m) => m.id));
  if (split.mode === "equal") {
    return split.memberIds.filter((id) => memberSet.has(id));
  }
  const ids = new Set<number>();
  for (const couple of couples) {
    if (!split.coupleIds.includes(couple.id)) continue;
    for (const mid of couple.memberIds) {
      if (memberSet.has(mid)) ids.add(mid);
    }
  }
  return [...ids];
}

/**
 * Keep payer inside the eligible set; prefer current if still valid.
 */
export function coercePayerId(
  currentPayerId: number | null | undefined,
  eligibleIds: number[]
): number | null {
  if (eligibleIds.length === 0) return null;
  if (currentPayerId != null && eligibleIds.includes(currentPayerId)) {
    return currentPayerId;
  }
  return eligibleIds[0] ?? null;
}

/**
 * Who shares this expense: equal among persons, or equal among couples
 * (then equal within each couple).
 */
export function ExpenseSplitParticipants({
  members,
  couples = [],
  value,
  onChange,
  compact,
  className,
}: {
  members: Member[];
  couples?: Couple[];
  value: ExpenseSplitSelection;
  onChange: (next: ExpenseSplitSelection) => void;
  compact?: boolean;
  className?: string;
}) {
  const hasCouples = couples.length > 0;
  const mode = value.mode;
  const selectedMemberIds =
    mode === "equal" ? new Set(value.memberIds) : new Set<number>();
  const selectedCoupleIds =
    mode === "coupleEqual" ? new Set(value.coupleIds) : new Set<number>();

  const allMembersSelected =
    members.length > 0 && members.every((m) => selectedMemberIds.has(m.id));
  const allCouplesSelected =
    couples.length > 0 && couples.every((c) => selectedCoupleIds.has(c.id));

  function setMode(next: "equal" | "coupleEqual") {
    if (next === "equal") {
      onChange({
        mode: "equal",
        memberIds: members.map((m) => m.id),
      });
    } else {
      onChange({
        mode: "coupleEqual",
        coupleIds: couples.map((c) => c.id),
      });
    }
  }

  function toggleMember(id: number) {
    const ids = value.mode === "equal" ? value.memberIds : [];
    if (selectedMemberIds.has(id)) {
      onChange({ mode: "equal", memberIds: ids.filter((x) => x !== id) });
    } else {
      onChange({ mode: "equal", memberIds: [...ids, id] });
    }
  }

  function toggleCouple(id: number) {
    const ids = value.mode === "coupleEqual" ? value.coupleIds : [];
    if (selectedCoupleIds.has(id)) {
      onChange({ mode: "coupleEqual", coupleIds: ids.filter((x) => x !== id) });
    } else {
      onChange({ mode: "coupleEqual", coupleIds: [...ids, id] });
    }
  }

  if (members.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className={compact ? "text-xs" : undefined}>
          {mode === "coupleEqual"
            ? "Beteiligt (gleich je Paar)"
            : "Beteiligt (gleicher Anteil)"}
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          {hasCouples ? (
            <div className="flex rounded-md border border-border/60 p-0.5 text-[11px]">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={cn(
                  "rounded px-2 py-0.5 font-medium",
                  mode === "equal"
                    ? "bg-[var(--brand-finance-soft)] text-[var(--brand-finance)] hover:bg-[var(--brand-finance-soft)]"
                    : "text-muted-foreground"
                )}
                onClick={() => setMode("equal")}
              >
                Personen
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={cn(
                  "rounded px-2 py-0.5 font-medium",
                  mode === "coupleEqual"
                    ? "bg-[var(--brand-finance-soft)] text-[var(--brand-finance)] hover:bg-[var(--brand-finance-soft)]"
                    : "text-muted-foreground"
                )}
                onClick={() => setMode("coupleEqual")}
              >
                Paare
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-[11px] font-medium text-[var(--brand-finance)]"
            onClick={() => {
              if (mode === "coupleEqual") {
                onChange({
                  mode: "coupleEqual",
                  coupleIds: allCouplesSelected ? [] : couples.map((c) => c.id),
                });
              } else {
                onChange({
                  mode: "equal",
                  memberIds: allMembersSelected
                    ? []
                    : members.map((m) => m.id),
                });
              }
            }}
          >
            {mode === "coupleEqual"
              ? allCouplesSelected
                ? "Keine"
                : "Alle"
              : allMembersSelected
                ? "Keine"
                : "Alle"}
          </Button>
        </div>
      </div>

      {mode === "coupleEqual" ? (
        <>
          <div
            className={cn(
              "grid gap-1.5 rounded-lg border border-border/60 bg-background/50 p-2",
              couples.length > 2 ? "sm:grid-cols-2" : "grid-cols-1"
            )}
          >
            {couples.map((c) => {
              const checked = selectedCoupleIds.has(c.id);
              const names = c.memberIds
                .map(
                  (id) =>
                    members.find((m) => m.id === id)?.display_name ?? `#${id}`
                )
                .join(", ");
              return (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50",
                    checked && "bg-[var(--brand-finance-soft)]/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCouple(c.id)}
                    className="size-4 accent-[var(--brand-finance)]"
                  />
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{c.name}</span>
                    {names ? (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        ({names})
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          {value.mode === "coupleEqual" && value.coupleIds.length === 0 ? (
            <p className="text-[11px] text-rose-600">
              Mindestens ein Paar wählen.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Betrag zuerst gleich auf Paare, dann innerhalb jedes Paars.
            </p>
          )}
        </>
      ) : (
        <>
          <div
            className={cn(
              "grid gap-1.5 rounded-lg border border-border/60 bg-background/50 p-2",
              members.length > 2 ? "sm:grid-cols-2" : "grid-cols-1"
            )}
          >
            {members.map((m) => {
              const checked = selectedMemberIds.has(m.id);
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
                    onChange={() => toggleMember(m.id)}
                    className="size-4 accent-[var(--brand-finance)]"
                  />
                  <span className="min-w-0 truncate font-medium">
                    {m.display_name}
                  </span>
                </label>
              );
            })}
          </div>
          {value.mode === "equal" && value.memberIds.length === 0 ? (
            <p className="text-[11px] text-rose-600">
              Mindestens eine Person wählen.
            </p>
          ) : value.mode === "equal" ? (
            <p className="text-[11px] text-muted-foreground">
              Betrag wird durch {value.memberIds.length} geteilt
              {value.memberIds.length === members.length
                ? " (ganze Gruppe)"
                : ""}
              .
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
