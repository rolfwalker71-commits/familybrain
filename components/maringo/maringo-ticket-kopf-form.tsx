"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { MariKeyPair } from "@/lib/mari/timekeeping-shared";
import {
  formatMariProjectLabel,
  looksLikeMariProjectNumber,
  sanitizeMariProjectNumber,
} from "@/lib/mari/timekeeping-shared";
import { MariKeyPairPicker } from "@/components/maringo/mari-key-pair-picker";
import type { MariEmployeeOption } from "@/lib/mari/tickets";
import type {
  MariSettingOption,
  MariSupportGroupOption,
} from "@/lib/mari/ticket-meta";

export type TicketKopfDefaults = {
  projectNumber?: string | null;
  projectLabel?: string | null;
  contractId?: number | null;
  contractPositionId?: number | null;
  activity?: string | null;
  /** USER_U_Std_Freigegeben_Kunde — ganze Stunden */
  stdFreigabe?: string | number | null;
  contactPerson?: string | null;
  supportGroupId?: number | null;
  handledBy?: string | null;
  priority?: number | null;
  medium?: number | null;
};

export type TicketKopfValues = {
  projectNumber: string;
  contractId: number | null;
  contractPositionId: number | null;
  activity: string;
  stdFreigabe: number | null;
  contactPerson: string | null;
  contactEmail: string | null;
  supportGroupId: number | null;
  handledBy: string | null;
  priority: number | null;
  medium: number | null;
};

function parseStdFreigabe(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function splitContactPerson(raw: string | null | undefined): {
  name: string;
  email: string;
} {
  const t = (raw || "").trim();
  if (!t) return { name: "", email: "" };
  const parts = t.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const maybeEmail = parts.find((p) => p.includes("@"));
    const name =
      parts.find((p) => p !== maybeEmail)?.trim() || parts[0] || "";
    return { name, email: maybeEmail || "" };
  }
  if (t.includes("@")) return { name: "", email: t };
  return { name: t, email: "" };
}

function joinContactPerson(name: string, email: string): string | null {
  const n = name.trim();
  const e = email.trim();
  if (n && e) return `${n}; ${e}`;
  if (n) return n;
  if (e) return e;
  return null;
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
  const initialContact = splitContactPerson(defaults.contactPerson);
  const initialProjectNumber =
    sanitizeMariProjectNumber(defaults.projectNumber) || "";
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<MariKeyPair[]>([]);
  const [projectNumber, setProjectNumber] = useState(initialProjectNumber);
  const [projectLabel, setProjectLabel] = useState(() => {
    if (!initialProjectNumber) return "";
    return (
      defaults.projectLabel?.trim() ||
      formatMariProjectLabel(initialProjectNumber, null)
    );
  });
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
  const [contactName, setContactName] = useState(initialContact.name);
  const [contactEmail, setContactEmail] = useState(initialContact.email);
  const [supportGroupId, setSupportGroupId] = useState(
    defaults.supportGroupId != null && defaults.supportGroupId > 0
      ? String(defaults.supportGroupId)
      : ""
  );
  const [handledBy, setHandledBy] = useState(
    (defaults.handledBy || "").trim().toUpperCase()
  );
  const [priority, setPriority] = useState(
    defaults.priority != null && defaults.priority > 0
      ? String(defaults.priority)
      : ""
  );
  const [medium, setMedium] = useState(
    defaults.medium != null && defaults.medium > 0
      ? String(defaults.medium)
      : ""
  );
  const [employees, setEmployees] = useState<MariEmployeeOption[]>([]);
  const [groups, setGroups] = useState<MariSupportGroupOption[]>([]);
  const [priorities, setPriorities] = useState<MariSettingOption[]>([]);
  const [media, setMedia] = useState<MariSettingOption[]>([]);
  const [projectOpen, setProjectOpen] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [empRes, grpRes, metaRes] = await Promise.all([
          fetch("/api/maringo/employees"),
          fetch("/api/maringo/support-groups"),
          fetch("/api/maringo/ticket-meta"),
        ]);
        const empData = await empRes.json().catch(() => ({}));
        const grpData = await grpRes.json().catch(() => ({}));
        const metaData = await metaRes.json().catch(() => ({}));
        if (cancelled) return;
        if (empRes.ok && Array.isArray(empData.employees)) {
          setEmployees(empData.employees as MariEmployeeOption[]);
        }
        if (grpRes.ok && Array.isArray(grpData.groups)) {
          setGroups(grpData.groups as MariSupportGroupOption[]);
        }
        if (metaRes.ok) {
          if (Array.isArray(metaData.priorities)) {
            setPriorities(metaData.priorities as MariSettingOption[]);
          }
          if (Array.isArray(metaData.media)) {
            setMedia(metaData.media as MariSettingOption[]);
          }
        }
      } catch {
        /* optional — Selects bleiben leer */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const visible = (p.keyVisible || "").trim();
    const internal = (p.keyInternal || "").trim();
    const pn = looksLikeMariProjectNumber(visible)
      ? visible
      : looksLikeMariProjectNumber(internal)
        ? internal
        : visible || internal;
    setProjectNumber(pn);
    setProjectLabel(formatMariProjectLabel(pn, p.matchcode));
    setProjectOpen(false);
    setContractId("");
    setContractPositionId("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setHint(null);
    const pn = sanitizeMariProjectNumber(projectNumber);
    if (!pn) {
      setError(
        "Projektnummer fehlt — bitte ein Projekt aus der Liste wählen (nicht den Kundennamen)."
      );
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
        contactPerson: joinContactPerson(contactName, contactEmail),
        contactEmail: contactEmail.trim() || null,
        supportGroupId: supportGroupId
          ? Number(supportGroupId) || null
          : null,
        handledBy: handledBy.trim() || null,
        priority: priority ? Number(priority) || null : null,
        medium: medium ? Number(medium) || null : null,
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
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs whitespace-pre-wrap break-words text-rose-950 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100">
          {hint}
        </p>
      ) : null}

      <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
        Ansprechpartner, Supportgruppe, Zuständig, Priorität und Kanal sowie
        Projekt / Vertrag / Betreff in MARI.
      </p>

      <div className="space-y-2 rounded-xl border border-border/60 bg-muted/15 p-3">
        <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Organisation
        </p>
        <div className="space-y-1">
          <Label htmlFor="tk-kopf-contact">Ansprechpartner</Label>
          <Input
            id="tk-kopf-contact"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="z.B. Herr Lucas Castro"
            maxLength={200}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-kopf-contact-email">E-Mail</Label>
          <Input
            id="tk-kopf-contact-email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="name@firma.ch"
            maxLength={120}
            autoComplete="off"
          />
          <p className="text-[0.625rem] text-muted-foreground">
            Wird mit dem Namen als «Name; E-Mail» in ContactPerson gespeichert.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-kopf-group">Supportgruppe</Label>
          <select
            id="tk-kopf-group"
            className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-[0.8125rem]"
            value={supportGroupId}
            onChange={(e) => setSupportGroupId(e.target.value)}
          >
            <option value="">— keine —</option>
            {groups.map((g) => (
              <option key={g.groupId} value={g.groupId}>
                {g.description}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-kopf-handled">Zuständig</Label>
          <select
            id="tk-kopf-handled"
            className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-[0.8125rem]"
            value={handledBy}
            onChange={(e) => setHandledBy(e.target.value)}
          >
            <option value="">— wählen —</option>
            {employees.map((e) => (
              <option key={e.employeeNumber} value={e.employeeNumber}>
                {e.matchcode} ({e.employeeNumber})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tk-kopf-prio">Priorität</Label>
            <select
              id="tk-kopf-prio"
              className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-[0.8125rem]"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="">— wählen —</option>
              {priorities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tk-kopf-medium">Kommunikationskanal</Label>
            <select
              id="tk-kopf-medium"
              className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-[0.8125rem]"
              value={medium}
              onChange={(e) => setMedium(e.target.value)}
            >
              <option value="">— wählen —</option>
              {media.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

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
                <p className="px-2.5 py-2 text-xs text-muted-foreground">
                  Lade…
                </p>
              ) : projects.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">
                  Keine Treffer
                </p>
              ) : (
                <ul>
                  {projects.slice(0, 80).map((p) => (
                    <li key={`${p.keyInternal}-${p.matchcode}`}>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full flex-col items-start justify-start px-2.5 py-1.5 text-left text-xs font-normal hover:bg-muted"
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
        <p className="text-[0.625rem] text-muted-foreground">
          USER_U_Std_Freigegeben_Kunde — ganze Stunden (leer = löschen)
        </p>
      </div>

      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {busy ? "Speichere…" : "Ticket-Kopf speichern"}
      </Button>
    </form>
  );
}
