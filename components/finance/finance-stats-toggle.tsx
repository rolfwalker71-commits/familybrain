"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  itemId: number;
  countsInStats: boolean;
  className?: string;
};

export function FinanceStatsToggle({
  itemId,
  countsInStats,
  className,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(countsInStats);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !value;
    setError(null);
    setValue(next);
    try {
      const res = await fetch("/api/finance/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, counts_in_stats: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Speichern fehlgeschlagen");
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setValue(!next);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className={cn("inline-flex flex-col items-end gap-0.5", className)}>
      <Button
        type="button"
        size="sm"
        variant={value ? "secondary" : "outline"}
        disabled={pending}
        title={
          value
            ? "Zählt in der Ausgabenstatistik – klicken zum Ausschliessen"
            : "Nicht in Statistik – klicken zum Mitzählen"
        }
        onClick={() => void toggle()}
        className={cn(
          !value && "border-dashed text-muted-foreground",
          pending && "opacity-70"
        )}
      >
        {value ? "In Statistik" : "Ohne Statistik"}
      </Button>
      {error ? (
        <span className="max-w-[10rem] truncate text-[10px] text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
