"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ListChecks,
  Minimize2,
  Sparkles,
  X,
} from "lucide-react";
import { GoogleLogo, MicrosoftLogo } from "@/components/branding/provider-logos";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  closeoutStepsFor,
  firstOpenStepIndex,
  microChecksFor,
  pathMatchesStep,
  stepDetail,
  stepDone,
  type CloseoutProvider,
  type CloseoutStatusPayload,
  type CloseoutStepId,
} from "@/lib/closeout/steps";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "buddy.closeout.assistant.v1";
const POLL_MS = 20_000;

type StoredState = {
  open: boolean;
  minimized: boolean;
  provider: CloseoutProvider;
  dismissedDate: string | null;
  stepIndex: number;
  autoAdvance: boolean;
  /** Manually skipped step ids for today (ISO date keyed in dismissedDate scope). */
  skipped: CloseoutStepId[];
};

const DEFAULT_STORED: StoredState = {
  open: false,
  minimized: false,
  provider: "microsoft",
  dismissedDate: null,
  stepIndex: 0,
  autoAdvance: true,
  skipped: [],
};

function readStored(): StoredState {
  if (typeof window === "undefined") return DEFAULT_STORED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STORED;
    return { ...DEFAULT_STORED, ...(JSON.parse(raw) as Partial<StoredState>) };
  } catch {
    return DEFAULT_STORED;
  }
}

function writeStored(next: StoredState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function StepVisual({
  stepId,
  provider,
  here,
  done,
}: {
  stepId: CloseoutStepId;
  provider: CloseoutProvider;
  here: boolean;
  done: boolean;
}) {
  const Icon =
    stepId === "calendar"
      ? CalendarDays
      : stepId === "triage"
        ? ListChecks
        : stepId === "day-analysis"
          ? Sparkles
          : stepId === "ticket-hours"
            ? ClipboardList
            : Check;
  const micros = microChecksFor(stepId);
  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
          {stepId === "day-analysis" && provider === "google" ? (
            <GoogleLogo className="size-5" />
          ) : stepId === "day-analysis" && provider === "microsoft" ? (
            <MicrosoftLogo className="size-5" />
          ) : stepId === "triage" && provider === "google" ? (
            <GoogleLogo className="size-5" />
          ) : stepId === "triage" && provider === "microsoft" ? (
            <MicrosoftLogo className="size-5" />
          ) : (
            <Icon
              className="size-5 text-orange-700"
              strokeWidth={APP_ICON_STROKE}
              absoluteStrokeWidth
              aria-hidden
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Wegleitung
            </p>
            {here ? (
              <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-800">
                Du bist hier
              </span>
            ) : null}
            {done ? (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800">
                Erledigt
              </span>
            ) : (
              <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-800">
                Noch offen
              </span>
            )}
          </div>
          <p className="text-[13px] font-semibold leading-snug text-foreground">
            {stepId === "calendar"
              ? "Kalender öffnen und offene Termine abarbeiten"
              : stepId === "triage"
                ? "Triage-Liste prüfen — Vorschläge anwenden oder skippen"
                : stepId === "day-analysis"
                  ? "Tagesanalyse starten und Resultate übernehmen"
                  : stepId === "ticket-hours"
                    ? "Stunden-Vorschläge aus Ticket-Terminen buchen"
                    : "Alle Schritte erledigt — guter Feierabend"}
          </p>
        </div>
      </div>
      {micros.length ? (
        <ul className="space-y-1 border-t border-border/40 pt-2">
          {micros.map((label, i) => (
            <li
              key={label}
              className="flex items-center gap-2 text-[11px] text-muted-foreground"
            >
              <span
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-border"
                )}
              >
                {done ? <Check className="size-2.5" aria-hidden /> : null}
              </span>
              <span className={done ? "text-emerald-800 line-through" : ""}>
                {i + 1}. {label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function CloseoutAssistant() {
  const { me, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [stored, setStored] = useState<StoredState>(DEFAULT_STORED);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<CloseoutStatusPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = readStored();
    setStored(s);
    setHydrated(true);
  }, []);

  useEffect(() => {
    function onOpen() {
      const s = readStored();
      const next = {
        ...s,
        open: true,
        minimized: false,
        dismissedDate: null,
      };
      writeStored(next);
      setStored(next);
    }
    window.addEventListener("buddy:closeout-open", onOpen);
    return () => window.removeEventListener("buddy:closeout-open", onOpen);
  }, []);

  const persist = useCallback((patch: Partial<StoredState>) => {
    setStored((prev) => {
      const next = { ...prev, ...patch };
      writeStored(next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/day-close");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Status laden fehlgeschlagen");
      setStatus(data as CloseoutStatusPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !me) return;
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [hydrated, me, load]);

  // Evening auto-open (weekdays from 18:00), once per day unless dismissed.
  useEffect(() => {
    if (!hydrated || !status || !me) return;
    if (!status.weekday) return;
    if (stored.dismissedDate === status.todayIso) return;
    if (stored.open) return;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
    if (hour >= 18) {
      persist({ open: true, minimized: false });
    }
  }, [hydrated, status, me, stored.dismissedDate, stored.open, persist]);

  const provider = stored.provider;
  const steps = useMemo(() => closeoutStepsFor(provider), [provider]);

  // Prefer connected provider when status arrives.
  useEffect(() => {
    if (!status || !hydrated) return;
    if (status.microsoftConnected && !status.googleConnected) {
      if (provider !== "microsoft") persist({ provider: "microsoft" });
    } else if (status.googleConnected && !status.microsoftConnected) {
      if (provider !== "google") persist({ provider: "google" });
    }
  }, [status, hydrated, provider, persist]);

  const activeIndex = Math.min(
    Math.max(0, stored.stepIndex),
    steps.length - 1
  );
  const active = steps[activeIndex];
  const search =
    typeof window !== "undefined" ? window.location.search : "";
  const here = active
    ? pathMatchesStep(pathname || "/", search, active)
    : false;

  function isStepComplete(stepId: CloseoutStepId): boolean {
    if (!status) return false;
    if (stored.skipped.includes(stepId) && stepId !== "done") return true;
    return stepDone(stepId, provider, status);
  }

  // Auto-advance when current step becomes done.
  useEffect(() => {
    if (!status || !stored.autoAdvance || !stored.open || stored.minimized) {
      return;
    }
    if (isStepComplete(active.id) && active.id !== "done") {
      const next = steps.findIndex(
        (s) => s.id === "done" || !isStepComplete(s.id)
      );
      const idx = next < 0 ? steps.length - 1 : next;
      if (idx !== activeIndex) persist({ stepIndex: idx });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional on status ticks
  }, [
    status,
    stored.autoAdvance,
    stored.open,
    stored.minimized,
    stored.skipped,
    active.id,
    activeIndex,
    provider,
    persist,
  ]);

  const remaining = status
    ? steps.filter((s) => s.id !== "done" && !isStepComplete(s.id)).length
    : 0;
  const progressDone = steps.filter((s) => isStepComplete(s.id)).length;
  const allClear = status != null && remaining === 0;

  if (loading || !hydrated || !me) return null;
  if (pathname === "/login" || pathname.startsWith("/share/")) return null;

  // Launcher pill when closed
  if (!stored.open) {
    return (
      <button
        type="button"
        onClick={() => persist({ open: true, minimized: false })}
        className={cn(
          "fixed z-40 flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-2 text-[12px] font-semibold shadow-[0_8px_28px_rgba(15,23,42,0.14)] transition-colors hover:bg-muted/40",
          "right-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:right-6 md:bottom-6"
        )}
        title="Tagesabschluss-Assistent"
      >
        <Sparkles
          className="size-3.5 text-orange-600"
          strokeWidth={APP_ICON_STROKE}
          absoluteStrokeWidth
          aria-hidden
        />
        Abschluss
        {remaining > 0 ? (
          <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] text-white">
            {remaining}
          </span>
        ) : null}
      </button>
    );
  }

  if (stored.minimized) {
    return (
      <button
        type="button"
        onClick={() => persist({ minimized: false })}
        className={cn(
          "fixed z-40 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-[12px] font-semibold text-white shadow-[0_8px_28px_rgba(15,23,42,0.22)]",
          "right-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:right-6 md:bottom-6"
        )}
      >
        {provider === "google" ? (
          <GoogleLogo className="size-3.5" />
        ) : (
          <MicrosoftLogo className="size-3.5" />
        )}
        {provider === "google" ? "Google" : "Outlook"} · {activeIndex + 1}/
        {steps.length}
        {remaining > 0 ? (
          <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px]">
            {remaining}
          </span>
        ) : (
          <Check className="size-3.5 text-emerald-300" aria-hidden />
        )}
        <ChevronUp className="size-3.5 opacity-80" aria-hidden />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed z-40 flex w-[min(100vw-1.5rem,22rem)] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_16px_48px_rgba(15,23,42,0.18)]",
        "right-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:right-6 md:bottom-6"
      )}
      role="dialog"
      aria-label="Tagesabschluss-Assistent"
    >
      <div className="flex items-center gap-2 bg-slate-800 px-3 py-2.5 text-white">
        <Sparkles className="size-4 text-orange-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold tracking-tight">
            Tagesabschluss ·{" "}
            {provider === "google" ? "Google" : "Outlook"}
          </p>
          <p className="text-[10px] text-white/70">
            Schritt {activeIndex + 1} von {steps.length}
            {busy ? " · aktualisiert…" : ""}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md p-1 hover:bg-white/10"
          title="Minimieren"
          onClick={() => persist({ minimized: true })}
        >
          <Minimize2 className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="rounded-md p-1 hover:bg-white/10"
          title="Schliessen"
          onClick={() =>
            persist({
              open: false,
              dismissedDate: status?.todayIso || stored.dismissedDate,
            })
          }
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="h-1.5 bg-muted">
        <div
          className="h-full bg-orange-500 transition-[width] duration-300"
          style={{
            width: `${Math.round((progressDone / steps.length) * 100)}%`,
          }}
        />
      </div>

      <div className="flex gap-1 border-b border-border/50 bg-muted/20 p-1.5">
        {(
          [
            {
              id: "google" as const,
              label: "Google",
              logo: <GoogleLogo className="size-3.5" />,
              enabled: status?.googleConnected !== false,
            },
            {
              id: "microsoft" as const,
              label: "Outlook",
              logo: <MicrosoftLogo className="size-3.5" />,
              enabled: status?.microsoftConnected !== false,
            },
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={status != null && !p.enabled && p.id !== provider}
            onClick={() =>
              persist({
                provider: p.id,
                stepIndex: status
                  ? firstOpenStepIndex(p.id, status)
                  : 0,
              })
            }
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors",
              provider === p.id
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-white/60"
            )}
          >
            {p.logo}
            {p.label}
          </button>
        ))}
      </div>

      <div className="max-h-[min(70vh,28rem)] space-y-3 overflow-y-auto p-3">
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}

        {allClear ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-[13px] font-semibold text-emerald-900">
            Alles erledigt für heute — guter Feierabend.
          </div>
        ) : null}

        {active ? (
          <StepVisual
            stepId={active.id}
            provider={provider}
            here={here}
            done={isStepComplete(active.id)}
          />
        ) : null}

        <ul className="space-y-1.5">
          {steps.map((step, idx) => {
            const done = isStepComplete(step.id);
            const skipped = stored.skipped.includes(step.id);
            const current = idx === activeIndex;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => persist({ stepIndex: idx })}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
                    current
                      ? "border-orange-300 bg-orange-50/80"
                      : done
                        ? "border-emerald-200/70 bg-emerald-50/40"
                        : "border-border/50 bg-background hover:bg-muted/30"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      done
                        ? "bg-emerald-500 text-white"
                        : current
                          ? "bg-orange-500 text-white"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {done ? <Check className="size-3" aria-hidden /> : idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold tracking-tight">
                        {step.title}
                      </span>
                      {status ? (
                        <span
                          className={cn(
                            "shrink-0 text-[10px] font-semibold",
                            done
                              ? "text-emerald-700"
                              : "text-orange-700"
                          )}
                        >
                          {skipped
                            ? "Übersprungen"
                            : stepDetail(step.id, provider, status)}
                        </span>
                      ) : null}
                    </span>
                    {current ? (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {step.hint}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {active && active.id !== "done" ? (
          <div className="flex gap-2">
            <Button
              type="button"
              className="min-w-0 flex-1 gap-1.5 bg-orange-500 text-white hover:bg-orange-600"
              onClick={() => {
                router.push(active.href);
                persist({ minimized: true });
              }}
            >
              {active.cta} →
            </Button>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              title="Schritt für heute überspringen"
              onClick={() => {
                const skipped = Array.from(
                  new Set([...stored.skipped, active.id])
                );
                const nextIdx = Math.min(activeIndex + 1, steps.length - 1);
                persist({ skipped, stepIndex: nextIdx });
              }}
            >
              Skip
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border/50 bg-muted/20 px-3 py-2.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={activeIndex <= 0}
          onClick={() => persist({ stepIndex: Math.max(0, activeIndex - 1) })}
        >
          Zurück
        </Button>
        <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            className="size-3 rounded border-border"
            checked={stored.autoAdvance}
            onChange={(e) => persist({ autoAdvance: e.target.checked })}
          />
          Auto
        </label>
        <div className="flex-1" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-[11px]"
          onClick={() =>
            persist({
              open: false,
              dismissedDate: status?.todayIso || null,
            })
          }
        >
          Später
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1 bg-orange-500 text-white hover:bg-orange-600"
          onClick={() => {
            if (activeIndex >= steps.length - 1 || allClear) {
              persist({
                open: false,
                dismissedDate: status?.todayIso || null,
                skipped: [],
              });
              return;
            }
            persist({ stepIndex: activeIndex + 1 });
          }}
        >
          {activeIndex >= steps.length - 1 || allClear
            ? "Fertig"
            : "Weiter"}
          <ChevronDown className="size-3.5 rotate-[-90deg]" aria-hidden />
        </Button>
      </div>

      <p className="bg-muted/30 px-3 pb-2 text-center text-[10px] text-muted-foreground">
        Läuft mit während du arbeitest ·{" "}
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => void load()}
        >
          Refresh
        </button>
        {" · "}
        <Link href="/dashboard" className="underline underline-offset-2">
          Übersicht
        </Link>
      </p>
    </div>
  );
}
