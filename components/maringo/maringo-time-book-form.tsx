"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { MariKeyPair } from "@/lib/mari/timekeeping";

export type TimeBookFormDefaults = {
  dayOfService?: string;
  projectNumber?: string | null;
  projectLabel?: string | null;
  phaseId?: number | null;
  contractId?: number | null;
  contractPositionId?: number | null;
  activity?: string;
  memoText?: string;
  hours?: number;
  hoursBillable?: number;
  billable?: boolean;
  issueId?: number | null;
};

export type TimeBookFormValues = {
  dayOfService: string;
  projectNumber: string;
  phaseId: number;
  contractId: number;
  contractPositionId: number | null;
  activity: string;
  memoText: string;
  hours: number;
  hoursBillable: number;
  issueId?: number | null;
};

function zurichTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseHours(raw: string): number | null {
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function MaringoTimeBookForm({
  defaults,
  submitLabel = "Buchen",
  onSubmit,
  className,
  layout = "compact",
}: {
  defaults?: TimeBookFormDefaults | null;
  submitLabel?: string;
  onSubmit: (values: TimeBookFormValues) => Promise<void>;
  className?: string;
  /** wide = volle Breite untereinander (Stunden-Tab); compact = Dialog */
  layout?: "wide" | "compact";
}) {
  const [dayOfService, setDayOfService] = useState(
    defaults?.dayOfService || zurichTodayYmd()
  );
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<MariKeyPair[]>([]);
  const [projectNumber, setProjectNumber] = useState(
    defaults?.projectNumber || ""
  );
  const [projectLabel, setProjectLabel] = useState(
    defaults?.projectLabel || defaults?.projectNumber || ""
  );
  const [phases, setPhases] = useState<MariKeyPair[]>([]);
  const [phaseId, setPhaseId] = useState(
    defaults?.phaseId != null ? String(defaults.phaseId) : ""
  );
  const [contracts, setContracts] = useState<MariKeyPair[]>([]);
  const [contractId, setContractId] = useState(
    defaults?.contractId != null ? String(defaults.contractId) : ""
  );
  const [positions, setPositions] = useState<MariKeyPair[]>([]);
  const [contractPositionId, setContractPositionId] = useState(
    defaults?.contractPositionId != null
      ? String(defaults.contractPositionId)
      : ""
  );
  const [activity, setActivity] = useState(defaults?.activity || "");
  const [memoText, setMemoText] = useState(defaults?.memoText || "");
  const [hoursRaw, setHoursRaw] = useState(
    String(defaults?.hours ?? 0.25)
  );
  const [hoursBillableRaw, setHoursBillableRaw] = useState(
    String(
      defaults?.hoursBillable ??
        (defaults?.billable === false ? 0 : defaults?.hours ?? 0.25)
    )
  );
  const [billable, setBillable] = useState(
    defaults?.billable ?? (defaults?.hoursBillable ?? 0.25) > 0
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const loadProjects = useCallback(async (q: string) => {
    setLoadingProjects(true);
    try {
      const res = await fetch(
        `/api/maringo/timekeeping/projects?q=${encodeURIComponent(q)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Projekte laden fehlgeschlagen");
      setProjects((data.projects || []) as MariKeyPair[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadProjects(projectQuery);
    }, 250);
    return () => window.clearTimeout(t);
  }, [projectQuery, loadProjects]);

  useEffect(() => {
    if (!projectNumber) {
      setPhases([]);
      setContracts([]);
      setPositions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [phRes, coRes] = await Promise.all([
          fetch(
            `/api/maringo/timekeeping/projects/${encodeURIComponent(projectNumber)}/phases`
          ),
          fetch(
            `/api/maringo/timekeeping/projects/${encodeURIComponent(projectNumber)}/contracts`
          ),
        ]);
        const ph = await phRes.json().catch(() => ({}));
        const co = await coRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!phRes.ok) throw new Error(ph.error || "Phasen laden fehlgeschlagen");
        if (!coRes.ok) throw new Error(co.error || "Verträge laden fehlgeschlagen");
        const nextPhases = (ph.phases || []) as MariKeyPair[];
        const nextContracts = (co.contracts || []) as MariKeyPair[];
        setPhases(nextPhases);
        setContracts(nextContracts);
        if (
          phaseId &&
          !nextPhases.some((p) => p.keyInternal === phaseId)
        ) {
          // keep preset id even if not in list
        } else if (!phaseId && nextPhases.length === 1) {
          setPhaseId(nextPhases[0]!.keyInternal);
        }
        if (
          contractId &&
          !nextContracts.some((c) => c.keyInternal === contractId)
        ) {
          // keep
        } else if (!contractId && nextContracts.length === 1) {
          setContractId(nextContracts[0]!.keyInternal);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when project changes
  }, [projectNumber]);

  useEffect(() => {
    if (!contractId || Number(contractId) <= 0) {
      setPositions([]);
      setContractPositionId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/maringo/timekeeping/contracts/${encodeURIComponent(contractId)}/positions`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Positionen laden fehlgeschlagen");
        const next = (data.positions || []) as MariKeyPair[];
        setPositions(next);
        if (
          contractPositionId &&
          !next.some((p) => p.keyInternal === contractPositionId)
        ) {
          // keep
        } else if (!contractPositionId && next.length === 1) {
          setContractPositionId(next[0]!.keyInternal);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  function selectProject(p: MariKeyPair) {
    setProjectNumber(p.keyInternal || p.keyVisible);
    setProjectLabel(
      [p.matchcode, p.keyVisible || p.keyInternal].filter(Boolean).join(" · ")
    );
    setProjectOpen(false);
    setPhaseId("");
    setContractId("");
    setContractPositionId("");
  }

  function onBillableToggle(next: boolean) {
    setBillable(next);
    const h = parseHours(hoursRaw) ?? 0;
    if (next) setHoursBillableRaw(String(h || 0.25));
    else setHoursBillableRaw("0");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const hours = parseHours(hoursRaw);
    const hoursBillable = parseHours(hoursBillableRaw);
    if (!projectNumber) {
      setError("Bitte Projekt wählen.");
      return;
    }
    if (!phaseId) {
      setError("Bitte Phase wählen.");
      return;
    }
    if (contracts.length > 0 && !contractId) {
      setError("Bitte Vertrag wählen.");
      return;
    }
    if (positions.length > 0 && !contractPositionId) {
      setError("Bitte Vertragsposition wählen.");
      return;
    }
    if (!activity.trim()) {
      setError("Aktivität fehlt.");
      return;
    }
    if (hours == null || hours <= 0) {
      setError("Stunden ungültig (z.B. 0.25).");
      return;
    }
    if (hoursBillable == null || hoursBillable < 0) {
      setError("Verrechenbare Stunden ungültig.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        dayOfService,
        projectNumber,
        phaseId: Number(phaseId),
        contractId: Number(contractId) || 0,
        contractPositionId: contractPositionId
          ? Number(contractPositionId)
          : null,
        activity: activity.trim(),
        memoText: memoText.trim(),
        hours,
        hoursBillable: billable ? Math.min(hoursBillable, hours) : 0,
        issueId: defaults?.issueId ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const wide = layout === "wide";

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className={cn("space-y-3", className)}
    >
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[12px] text-rose-950">
          {error}
        </p>
      ) : null}

      <div
        className={cn(
          "grid gap-3",
          wide
            ? "sm:grid-cols-2 lg:grid-cols-4"
            : "sm:grid-cols-2"
        )}
      >
        <div className="space-y-1">
          <Label htmlFor="tk-date">Datum</Label>
          <Input
            id="tk-date"
            type="date"
            value={dayOfService}
            onChange={(e) => setDayOfService(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-hours">Stunden</Label>
          <Input
            id="tk-hours"
            inputMode="decimal"
            value={hoursRaw}
            onChange={(e) => {
              setHoursRaw(e.target.value);
              if (billable) setHoursBillableRaw(e.target.value);
            }}
            placeholder="0.25"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-billable-h">Davon verrechenbar</Label>
          <Input
            id="tk-billable-h"
            inputMode="decimal"
            value={hoursBillableRaw}
            onChange={(e) => setHoursBillableRaw(e.target.value)}
            disabled={!billable}
            placeholder="0.25"
          />
        </div>
        <div className={cn("flex items-end pb-1", !wide && "sm:col-span-2")}>
          <label className="flex h-9 items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => onBillableToggle(e.target.checked)}
            />
            Verrechenbar
          </label>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="tk-project">Projekt</Label>
        <div className="relative">
          <Input
            id="tk-project"
            value={projectOpen ? projectQuery : projectLabel || projectQuery}
            onChange={(e) => {
              setProjectQuery(e.target.value);
              setProjectOpen(true);
            }}
            onFocus={() => {
              setProjectOpen(true);
              setProjectQuery("");
            }}
            placeholder="Suche z.B. Werk oder P200000"
            autoComplete="off"
          />
          {projectOpen ? (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg">
              {loadingProjects ? (
                <p className="px-2.5 py-2 text-[12px] text-muted-foreground">
                  Lade…
                </p>
              ) : projects.length === 0 ? (
                <p className="px-2.5 py-2 text-[12px] text-muted-foreground">
                  Keine Treffer
                </p>
              ) : (
                <ul>
                  {projects.slice(0, 80).map((p) => (
                    <li key={`${p.keyInternal}-${p.matchcode}`}>
                      <button
                        type="button"
                        className="flex w-full flex-col px-2.5 py-1.5 text-left text-[12px] hover:bg-muted"
                        onClick={() => selectProject(p)}
                      >
                        <span className="font-medium">{p.matchcode}</span>
                        <span className="text-muted-foreground">
                          {p.keyVisible || p.keyInternal}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "grid gap-3",
          wide ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
        )}
      >
        <div className="space-y-1">
          <Label htmlFor="tk-phase">Phase</Label>
          <select
            id="tk-phase"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={phaseId}
            onChange={(e) => setPhaseId(e.target.value)}
            disabled={!projectNumber}
          >
            <option value="">Phase wählen…</option>
            {phases.map((p) => (
              <option key={p.keyInternal} value={p.keyInternal}>
                {p.matchcode}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-contract">Vertrag</Label>
          <select
            id="tk-contract"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={contractId}
            onChange={(e) => {
              setContractId(e.target.value);
              setContractPositionId("");
            }}
            disabled={!projectNumber}
          >
            <option value="">
              {contracts.length === 0
                ? "Kein Vertrag nötig"
                : "Vertrag wählen…"}
            </option>
            {contracts.map((c) => (
              <option key={c.keyInternal} value={c.keyInternal}>
                {[c.keyVisible, c.matchcode].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </div>
        {positions.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="tk-pos">Vertragsposition</Label>
            <select
              id="tk-pos"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={contractPositionId}
              onChange={(e) => setContractPositionId(e.target.value)}
            >
              <option value="">Position wählen…</option>
              {positions.map((p) => (
                <option key={p.keyInternal} value={p.keyInternal}>
                  {[p.keyVisible, p.matchcode].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className={cn("grid gap-3", wide && "lg:grid-cols-2")}>
        <div className="space-y-1">
          <Label htmlFor="tk-activity">Aktivität</Label>
          <Input
            id="tk-activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            maxLength={100}
            placeholder="z.B. Daily Call ANG CH"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-memo">Memo</Label>
          <Textarea
            id="tk-memo"
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            rows={wide ? 2 : 3}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Buche…" : submitLabel}
        </Button>
        {projectOpen ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setProjectOpen(false)}
          >
            Projektliste schliessen
          </Button>
        ) : null}
      </div>
    </form>
  );
}
