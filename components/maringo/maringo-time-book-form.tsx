"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import type { MariKeyPair } from "@/lib/mari/timekeeping-shared";
import { formatMariProjectLabel } from "@/lib/mari/timekeeping-shared";
import { TIMEKEEPING_INT_BEMERKUNG_OPTIONS } from "@/lib/mari/timekeeping-udfs";
import type { MariTimeBookFavorite } from "@/lib/mari/time-book-favorites";
import { MariKeyPairPicker } from "@/components/maringo/mari-key-pair-picker";

export type TimeBookFormDefaults = {
  dayOfService?: string;
  projectNumber?: string | null;
  projectLabel?: string | null;
  contractId?: number | null;
  contractPositionId?: number | null;
  activity?: string;
  memoText?: string;
  hours?: number;
  hoursBillable?: number;
  billable?: boolean;
  issueId?: number | null;
  internalRemarkVerr?: string | null;
  zeroHoursReason?: string | null;
};

export type TimeBookFormValues = {
  dayOfService: string;
  projectNumber: string;
  projectLabel: string;
  contractId: number;
  contractPositionId: number | null;
  activity: string;
  memoText: string;
  hours: number;
  hoursBillable: number;
  issueId?: number | null;
  internalRemarkVerr: string | null;
  zeroHoursReason: string | null;
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
  enableFavorites = true,
}: {
  defaults?: TimeBookFormDefaults | null;
  submitLabel?: string;
  onSubmit: (values: TimeBookFormValues) => Promise<void>;
  className?: string;
  /** wide = volle Breite untereinander (Stunden-Tab); compact = Dialog */
  layout?: "wide" | "compact";
  enableFavorites?: boolean;
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
  const [internalRemarkVerr, setInternalRemarkVerr] = useState(
    defaults?.internalRemarkVerr || ""
  );
  const [zeroHoursReason, setZeroHoursReason] = useState(
    defaults?.zeroHoursReason || ""
  );
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
  const [hint, setHint] = useState<string | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [favorites, setFavorites] = useState<MariTimeBookFavorite[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [saveAsFavorite, setSaveAsFavorite] = useState(false);
  const [favoriteName, setFavoriteName] = useState("");

  const loadFavorites = useCallback(async () => {
    if (!enableFavorites) return;
    setFavoritesLoading(true);
    try {
      const res = await fetch("/api/maringo/timekeeping/favorites");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Favoriten laden fehlgeschlagen");
      setFavorites((data.favorites || []) as MariTimeBookFavorite[]);
    } catch {
      /* Favoriten optional — Maske bleibt nutzbar */
    } finally {
      setFavoritesLoading(false);
    }
  }, [enableFavorites]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

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
      setContracts([]);
      setPositions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const coRes = await fetch(
          `/api/maringo/timekeeping/projects/${encodeURIComponent(projectNumber)}/contracts`
        );
        const co = await coRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!coRes.ok) throw new Error(co.error || "Verträge laden fehlgeschlagen");
        const nextContracts = (co.contracts || []) as MariKeyPair[];
        setContracts(nextContracts);
        if (
          contractId &&
          !nextContracts.some((c) => c.keyInternal === contractId)
        ) {
          // keep preset
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
    const pn = p.keyVisible || p.keyInternal;
    setProjectNumber(p.keyInternal || p.keyVisible);
    setProjectLabel(formatMariProjectLabel(pn, p.matchcode));
    setProjectOpen(false);
    setContractId("");
    setContractPositionId("");
  }

  function onBillableToggle(next: boolean) {
    setBillable(next);
    const h = parseHours(hoursRaw) ?? 0;
    if (next) setHoursBillableRaw(String(h || 0.25));
    else setHoursBillableRaw("0");
  }

  function applyFavorite(fav: MariTimeBookFavorite) {
    setError(null);
    setHint(
      `Favorit «${fav.name}» geladen — Datum und Stunden prüfen, dann buchen.`
    );
    setProjectNumber(fav.projectNumber);
    setProjectLabel(fav.projectLabel || fav.projectNumber);
    setContractId(fav.contractId != null ? String(fav.contractId) : "");
    setContractPositionId(
      fav.contractPositionId != null ? String(fav.contractPositionId) : ""
    );
    setActivity(fav.activity);
    setMemoText(fav.memoText || "");
    setBillable(fav.billable);
    setHoursBillableRaw(
      fav.billable ? String(fav.hoursBillable ?? fav.hours) : "0"
    );
    // Typische Stunden aus Favorit übernehmen — leicht anpassbar
    setHoursRaw(String(fav.hours));
    setProjectOpen(false);
  }

  function favoritePayloadFromForm(name: string) {
    const hours = parseHours(hoursRaw) ?? 0.25;
    const hoursBillable = parseHours(hoursBillableRaw) ?? (billable ? hours : 0);
    return {
      name: name.trim(),
      projectNumber,
      projectLabel: projectLabel || projectNumber,
      contractId: contractId ? Number(contractId) : null,
      contractPositionId: contractPositionId
        ? Number(contractPositionId)
        : null,
      activity: activity.trim(),
      memoText: memoText.trim() || null,
      hours,
      hoursBillable: billable ? Math.min(hoursBillable, hours) : 0,
      billable,
    };
  }

  async function persistFavorite(name: string) {
    const res = await fetch("/api/maringo/timekeeping/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(favoritePayloadFromForm(name)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Favorit speichern fehlgeschlagen");
    await loadFavorites();
    return data.favorite as MariTimeBookFavorite | undefined;
  }

  async function deleteFavorite(id: number) {
    setError(null);
    const res = await fetch(`/api/maringo/timekeeping/favorites/${id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Favorit löschen fehlgeschlagen");
      return;
    }
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setHint(null);
    const hours = parseHours(hoursRaw);
    const hoursBillable = parseHours(hoursBillableRaw);
    if (!projectNumber) {
      setError("Bitte Projekt wählen.");
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
    if (enableFavorites && saveAsFavorite) {
      const name = (favoriteName.trim() || activity.trim()).slice(0, 80);
      if (!name) {
        setError("Name für Favorit fehlt.");
        return;
      }
    }
    setBusy(true);
    try {
      await onSubmit({
        dayOfService,
        projectNumber,
        projectLabel: projectLabel || projectNumber,
        contractId: Number(contractId) || 0,
        contractPositionId: contractPositionId
          ? Number(contractPositionId)
          : null,
        activity: activity.trim(),
        memoText: memoText.trim(),
        hours,
        hoursBillable: billable ? Math.min(hoursBillable, hours) : 0,
        issueId: defaults?.issueId ?? null,
        internalRemarkVerr: internalRemarkVerr.trim() || null,
        zeroHoursReason: zeroHoursReason.trim() || null,
      });
      if (enableFavorites && saveAsFavorite) {
        const name = (favoriteName.trim() || activity.trim()).slice(0, 80);
        try {
          await persistFavorite(name);
          setHint(`Favorit «${name}» gespeichert.`);
          setSaveAsFavorite(false);
          setFavoriteName("");
        } catch (favErr) {
          setHint(
            `Gebucht, aber Favorit nicht gespeichert: ${
              favErr instanceof Error ? favErr.message : String(favErr)
            }`
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveFavoriteOnly() {
    setError(null);
    setHint(null);
    if (!projectNumber) {
      setError("Bitte Projekt wählen.");
      return;
    }
    if (!activity.trim()) {
      setError("Aktivität fehlt.");
      return;
    }
    const name = (
      favoriteName.trim() ||
      activity.trim() ||
      projectLabel ||
      projectNumber
    ).slice(0, 80);
    setBusy(true);
    try {
      await persistFavorite(name);
      setHint(`Favorit «${name}» gespeichert.`);
      setSaveAsFavorite(false);
      setFavoriteName("");
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
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[12px] whitespace-pre-wrap break-words text-rose-950 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-[12px] text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/12 dark:text-sky-100">
          {hint}
        </p>
      ) : null}

      {enableFavorites ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Star className="size-3.5" strokeWidth={APP_ICON_STROKE} />
            Favoriten
          </div>
          {favoritesLoading && favorites.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Lade Favoriten…</p>
          ) : favorites.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Noch keine Favoriten — unten «Als Favorit speichern» wählen.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {favorites.map((fav) => (
                <div
                  key={fav.id}
                  className="inline-flex max-w-full items-center gap-0.5 rounded-lg border border-border/70 bg-muted/40 pl-1"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto max-w-[14rem] truncate px-2 py-1 text-left text-[12px] font-medium"
                    title={`${formatMariProjectLabel(fav.projectNumber, fav.projectLabel)} · ${fav.activity}`}
                    onClick={() => applyFavorite(fav)}
                  >
                    {fav.name}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mr-0.5 text-muted-foreground hover:text-rose-700"
                    aria-label={`Favorit «${fav.name}» löschen`}
                    title="Löschen"
                    onClick={() => void deleteFavorite(fav.id)}
                  >
                    <X className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-3",
          wide
            ? "grid-cols-1 sm:grid-cols-[minmax(9.5rem,11rem)_5.5rem_minmax(0,1fr)]"
            : "grid-cols-1 sm:grid-cols-[minmax(9.5rem,1fr)_5.5rem] sm:[&>*:last-child]:col-span-2"
        )}
      >
        <div className="space-y-1">
          <Label htmlFor="tk-date" className="block truncate">
            Datum
          </Label>
          <Input
            id="tk-date"
            type="date"
            value={dayOfService}
            onChange={(e) => setDayOfService(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-hours" className="block truncate">
            Stunden
          </Label>
          <Input
            id="tk-hours"
            inputMode="decimal"
            className="tabular-nums"
            value={hoursRaw}
            onChange={(e) => {
              setHoursRaw(e.target.value);
              if (billable) setHoursBillableRaw(e.target.value);
            }}
            placeholder="0.25"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-billable-h" className="block truncate">
            Davon verrechenbar
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="tk-billable-h"
              inputMode="decimal"
              className="min-w-[5.5rem] flex-1 tabular-nums"
              value={hoursBillableRaw}
              onChange={(e) => setHoursBillableRaw(e.target.value)}
              disabled={!billable}
              placeholder="0.25"
            />
            <label className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap text-[13px]">
              <input
                type="checkbox"
                checked={billable}
                onChange={(e) => onBillableToggle(e.target.checked)}
              />
              Verrechenbar
            </label>
          </div>
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
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full flex-col items-start justify-start px-2.5 py-1.5 text-left text-[12px] font-normal hover:bg-muted"
                        onClick={() => selectProject(p)}
                      >
                        <span className="font-medium">{p.matchcode}</span>
                        <span className="text-muted-foreground">
                          {p.keyVisible || p.keyInternal}
                        </span>
                      </Button>
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
          id="tk-contract"
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
            id="tk-pos"
            label="Vertragsposition"
            value={contractPositionId}
            options={positions}
            placeholder="Position wählen…"
            onChange={setContractPositionId}
          />
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tk-int-bemerkung">
            Interne Bemerkung zur Verrechnung
          </Label>
          <select
            id="tk-int-bemerkung"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={internalRemarkVerr}
            onChange={(e) => setInternalRemarkVerr(e.target.value)}
          >
            <option value="">—</option>
            {TIMEKEEPING_INT_BEMERKUNG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-nuller">Grund für Nullerstunden</Label>
          <Input
            id="tk-nuller"
            value={zeroHoursReason}
            onChange={(e) => setZeroHoursReason(e.target.value)}
            maxLength={500}
            placeholder="Optional"
          />
        </div>
      </div>

      {enableFavorites ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={saveAsFavorite}
              onChange={(e) => {
                setSaveAsFavorite(e.target.checked);
                if (e.target.checked && !favoriteName.trim()) {
                  setFavoriteName(activity.trim().slice(0, 80));
                }
              }}
            />
            Als Favorit speichern
          </label>
          {saveAsFavorite ? (
            <div className="space-y-1">
              <Label htmlFor="tk-fav-name">Favoritenname</Label>
              <Input
                id="tk-fav-name"
                value={favoriteName}
                onChange={(e) => setFavoriteName(e.target.value)}
                maxLength={80}
                placeholder="z.B. Daily ANG"
              />
              <p className="text-[11px] text-muted-foreground">
                Speichert Projekt, Vertrag, Aktivität, Memo und Verrechenbarkeit
                (ohne Datum). Beim Buchen mit — oder nur Favorit speichern.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Speichere…" : submitLabel}
        </Button>
        {enableFavorites && saveAsFavorite ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void saveFavoriteOnly()}
          >
            Nur Favorit speichern
          </Button>
        ) : null}
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
