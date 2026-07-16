"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TRAVEL_TYPES } from "@/lib/extraction/normalize-categories";
import { cn } from "@/lib/utils";

type Props = {
  itemId: number;
  currentType: string;
  learnHint?: string | null;
  className?: string;
};

export function TravelTypeReclassify({
  itemId,
  currentType,
  learnHint,
  className,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(currentType);
  const [learn, setLearn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const items = useMemo(
    () => Object.fromEntries(TRAVEL_TYPES.map((t) => [t, t])),
    []
  );

  async function save(next: string) {
    if (!next || next === currentType) {
      setValue(currentType);
      return;
    }
    setError(null);
    setInfo(null);
    setValue(next);
    try {
      const res = await fetch("/api/travel/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: itemId,
          travel_type: next,
          learn,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Speichern fehlgeschlagen");
      }
      if (data.learned) {
        setInfo(
          `Gelernt: ${data.learn_label || "Regel gespeichert"} · ${data.applied_to} Einträge`
        );
      } else {
        setInfo("Nur dieser Eintrag umklassifiziert");
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setValue(currentType);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-2", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={value}
          onValueChange={(v) => {
            if (v != null) void save(v);
          }}
          items={items}
          disabled={pending}
        >
          <SelectTrigger size="sm" className="min-w-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRAVEL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant={learn ? "secondary" : "outline"}
          disabled={pending}
          title={
            learnHint
              ? `Ähnliche Fälle lernen (${learnHint})`
              : "Ähnliche Fälle für die Zukunft lernen"
          }
          onClick={() => setLearn((v) => !v)}
        >
          {learn ? "Lernen an" : "Nur hier"}
        </Button>
      </div>
      {learn && learnHint ? (
        <p className="text-[11px] text-muted-foreground">{learnHint}</p>
      ) : null}
      {info ? (
        <p className="text-[11px] text-muted-foreground">{info}</p>
      ) : null}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
