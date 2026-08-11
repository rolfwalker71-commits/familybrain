"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { MariKeyPair } from "@/lib/mari/timekeeping-shared";
import { formatMariProjectLabel } from "@/lib/mari/timekeeping-shared";
import { MariKeyPairPicker } from "@/components/maringo/mari-key-pair-picker";

export type TicketKopfDefaults = {
  projectNumber?: string | null;
  projectLabel?: string | null;
  contractId?: number | null;
  contractPositionId?: number | null;
  activity?: string | null;
  /** USER_U_Std_Freigegeben_Kunde — ganze Stunden */
  stdFreigabe?: string | number | null;
};

export type TicketKopfValues = {
  projectNumber: string;
  contractId: number | null;
  contractPositionId: number | null;
  activity: string;
  stdFreigabe: number | null;
};

function parseStdFreigabe(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function MaringoTicketKopfForm({
  defaults,
  onSubmit,
  className,
}: {
  defaults: TicketKopfDefaults;
  onSubmit: (values: TicketKopfValues) => Promise<void>;
  className?: string;
}) {
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<MariKeyPair[]>([]);
  const [projectNumber, setProjectNumber] = useState(
    defaults.projectNumber || ""
  );
  const [projectLabel, setProjectLabel] = useState(
    defaults.projectLabel || defaults.projectNumber || ""
  );
  const [contracts, setContracts] = useState<MariKeyPair[]>([]);
  const [contractId, setContractId] = useState(
    defaults.contractId != null && defaults.contractId > 0
      ? String(defaults.contractId)
      : ""
  );
  const [positions, setPositions] = useState<MariKeyPair[]>([]);
  const [contractPositionId, setContractPositionId] = useState(
    defaults.contractPositionId != null && defaults.contractPositionId > 0
      ? String(defaults.contractPositionId)
      : ""
  );
  const [activity, setActivity] = useState(defaults.activity || "");
  const [stdFreigabeRaw, setStdFreigabeRaw] = useState(() => {
    const v = defaults.stdFreigabe;
    if (v == null || v === "") return "";
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.round(n)) : String(v);
  });
  const [projectOpen, setProjectOpen] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!projectOpen) return;
    let cancelled = false;
    const q = projectQuery.trim();
    const t = window.setTimeout(() => {
      void (async () => {
        setLoadingProjects(true);
        try {
          const res = await fetch(
            `/api/maringo/timekeeping/projects${
              q ? `?q=${encodeURIComponent(q)}` : ""
            }`
          );
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            throw new Error(data.error || "Projekte laden fehlgeschlagen");
          }
          setProjects((data.projects || []) as MariKeyPair[]);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
          }
        } finally {
          if (!cancelled) setLoadingProjects(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [projectOpen, projectQuery]);

  useEffect(() => {
    if (!projectNumber) {
      setContracts([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/maringo/timekeeping/projects/${encodeURIComponent(
            projectNumber
          )}/contracts`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data.error || "Verträge laden fehlgeschlagen");
        }
        setContracts((data.contracts || []) as MariKeyPair[]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectNumber]);

  useEffect(() => {
    if (!contractId) {
      setPositions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/maringo/timekeeping/contracts/${encodeURIComponent(
            contractId
          )}/positions`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data.error || "Positionen laden fehlgeschlagen");
        }
        const next = (data.positions || []) as MariKeyPair[];
        setPositions(next);
        if (!contractPositionId && next.length === 1) {
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
    const pn = p.keyVisible || p.keyInternal;
    setProjectNumber(p.keyInternal || p.keyVisible);
    setProjectLabel(formatMariProjectLabel(pn, p.matchcode));
    setProjectOpen(false);
    setContractId("");
    setContractPositionId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setHint(null);
    const pn = projectNumber.trim();
    if (!pn) {
      setError("Projektnummer fehlt.");
      return;
    }
    const act = activity.trim();
    if (!act) {
      setError("Aktivität / Betreff fehlt.");
      return;
    }
    if (stdFreigabeRaw.trim() && parseStdFreigabe(stdFreigabeRaw) == null) {
      setError("Freigegebene Std. muss eine ganze Zahl ≥ 0 sein.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        projectNumber: pn,
        contractId: contractId ? Number(contractId) || null : null,
        contractPositionId: contractPositionId
          ? Number(contractPositionId) || null
          : null,
        activity: act,
        stdFreigabe: parseStdFreigabe(stdFreigabeRaw),
      });
      setHint("Ticket-Kopf gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className={cn("space-y-3", className)}
    >
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[12px] whitespace-pre-wrap break-words text-rose-950">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[12px] text-emerald-950">
          {hint}
        </p>
      ) : null}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Überschreibt die Ticket-Vorgaben in MARI (Projekt, Vertrag, Betreff /
        Aktivität, freigegebene Kundenstunden).
      </p>

      <div className="space-y-1">
        <Label htmlFor="tk-kopf-project">Projekt</Label>
        <div className="relative">
          <Input
            id="tk-kopf-project"
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

      <div className="space-y-3">
        <MariKeyPairPicker
          id="tk-kopf-contract"
          label="Vertrag"
          value={contractId}
          options={contracts}
          placeholder="Vertrag wählen…"
          emptyLabel="Kein Vertrag nötig"
          disabled={!projectNumber}
          onChange={(next) => {
            setContractId(next);
            setContractPositionId("");
          }}
        />
        {positions.length > 0 ? (
          <MariKeyPairPicker
            id="tk-kopf-pos"
            label="Vertragsposition"
            value={contractPositionId}
            options={positions}
            placeholder="Position wählen…"
            onChange={setContractPositionId}
          />
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="tk-kopf-activity">Aktivität / Betreff</Label>
        <Input
          id="tk-kopf-activity"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          maxLength={250}
          placeholder="Kurzbeschreibung / Aktivitäts-Vorlage"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="tk-kopf-std">Freigegebene Std. Kunde</Label>
        <Input
          id="tk-kopf-std"
          inputMode="numeric"
          className="tabular-nums"
          value={stdFreigabeRaw}
          onChange={(e) => setStdFreigabeRaw(e.target.value)}
          placeholder="z.B. 8"
        />
        <p className="text-[10px] text-muted-foreground">
          USER_U_Std_Freigegeben_Kunde — ganze Stunden (leer = löschen)
        </p>
      </div>

      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {busy ? "Speichere…" : "Ticket-Kopf speichern"}
      </Button>
    </form>
  );
}
