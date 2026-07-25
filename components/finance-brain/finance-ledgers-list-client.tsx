"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/layout/page-primitives";
import { IconCircle, pageVisuals } from "@/components/layout/icon-circle";
import { SoftFab } from "@/components/layout/soft-ui";
import { useAuth } from "@/components/auth/auth-provider";
import {
  COMMON_CURRENCIES,
  LEDGER_KIND_LABELS,
  type LedgerKind,
} from "@/lib/finance-brain/constants";
import { cn } from "@/lib/utils";

type Ledger = {
  id: number;
  title: string;
  base_currency: string;
  ledger_kind?: LedgerKind;
  trip_id: number | null;
  trip_title: string | null;
  cover_url?: string | null;
  updated_at: string;
};

type AppUserOption = {
  id: number;
  username: string;
  display_name: string;
  email: string;
  active: number;
};

export function FinanceLedgersListClient() {
  const { me, loading: authLoading } = useAuth();
  const isAdmin = !authLoading && me?.kind !== "user";
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [users, setUsers] = useState<AppUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("CHF");
  const [ledgerKind, setLedgerKind] = useState<LedgerKind>("split");
  const [memberNames, setMemberNames] = useState("");
  const [memberUserIds, setMemberUserIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/finance-ledgers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      setLedgers(data.ledgers || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) return;
      setUsers(
        (data.users || []).filter((u: AppUserOption) => Boolean(u.active))
      );
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [isAdmin]);

  async function createLedger() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const names = memberNames
        .split(/[,;\n]+/)
        .map((n) => n.trim())
        .filter(Boolean);
      const res = await fetch("/api/finance-ledgers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          baseCurrency,
          ledgerKind,
          memberNames:
            ledgerKind === "split" && names.length ? names : undefined,
          memberUserIds:
            ledgerKind === "split" && memberUserIds.length
              ? memberUserIds
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anlegen fehlgeschlagen");
      setTitle("");
      setMemberNames("");
      setMemberUserIds([]);
      setLedgerKind("split");
      setCreateOpen(false);
      await load();
      if (data.ledger?.id) {
        window.location.assign(`/finance-brain/${data.ledger.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function removeLedger(id: number, ledgerTitle: string) {
    if (!window.confirm(`Abrechnung «${ledgerTitle}» wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/finance-ledgers/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function importBackup(file: File) {
    setStatusMsg(null);
    setError(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const res = await fetch("/api/finance-ledgers/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import fehlgeschlagen");
      const warnCount = Array.isArray(data.warnings) ? data.warnings.length : 0;
      setStatusMsg(
        `Import: ${data.ledgersCreated ?? 0} Abrechnungen, ${data.expensesCreated ?? 0} Buchungen` +
          (warnCount ? `, ${warnCount} Hinweise` : "") +
          "."
      );
      if (Array.isArray(data.warnings) && data.warnings.length) {
        console.warn("[finanzbuddy backup import]", data.warnings);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  // Render helper (not a nested component) — nested components remount on every
  // keystroke and steal focus from the Name input.
  function renderCreateForm(compact?: boolean) {
    return (
      <div className={cn("grid gap-3", !compact && "sm:grid-cols-2")}>
        <div className={cn("space-y-1.5", !compact && "sm:col-span-2")}>
          <Label htmlFor={compact ? "ledgerTitleMobile" : "ledgerTitle"}>
            Name
          </Label>
          <Input
            id={compact ? "ledgerTitleMobile" : "ledgerTitle"}
            placeholder="z.B. Miami 2026"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Typ</Label>
          <Select
            value={ledgerKind}
            onValueChange={(v) => {
              if (v == null) return;
              setLedgerKind(v as LedgerKind);
            }}
            items={LEDGER_KIND_LABELS}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="split">{LEDGER_KIND_LABELS.split}</SelectItem>
              <SelectItem value="normal">
                {LEDGER_KIND_LABELS.normal}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {ledgerKind === "split"
              ? "Gemeinsame Ausgaben splitten und ausgleichen"
              : "Nur Ein- und Ausgaben verbuchen – ohne Settle-up"}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Basiswährung</Label>
          <Select
            value={baseCurrency}
            onValueChange={(v) => {
              if (v == null) return;
              setBaseCurrency(v);
            }}
            items={Object.fromEntries(COMMON_CURRENCIES.map((c) => [c, c]))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {ledgerKind === "split" ? (
          <>
            {users.length > 0 ? (
              <div className={cn("space-y-1.5", !compact && "sm:col-span-2")}>
                <Label>App-User als Teilnehmer</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/50 p-2">
                  {users.map((user) => (
                    <label
                      key={user.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={memberUserIds.includes(user.id)}
                        onChange={() => {
                          setMemberUserIds((prev) =>
                            prev.includes(user.id)
                              ? prev.filter((id) => id !== user.id)
                              : [...prev, user.id]
                          );
                        }}
                      />
                      <span className="truncate">
                        {user.display_name}{" "}
                        <span className="text-muted-foreground">
                          (@{user.username})
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Gewählte User erhalten Split-Mitgliedschaft und App-Zugriff.
                </p>
              </div>
            ) : null}
            <div className={cn("space-y-1.5", !compact && "sm:col-span-2")}>
              <Label htmlFor={compact ? "memberNamesMobile" : "memberNames"}>
                Weitere Teilnehmer (optional)
              </Label>
              <Input
                id={compact ? "memberNamesMobile" : "memberNames"}
                placeholder="Anna, Ben, Chris"
                value={memberNames}
                onChange={(e) => setMemberNames(e.target.value)}
              />
            </div>
          </>
        ) : null}
        <div className={cn(!compact && "sm:col-span-2")}>
          <Button
            className="w-full bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90 sm:w-auto"
            onClick={() => void createLedger()}
            disabled={creating || !title.trim()}
          >
            <Plus className="mr-2 size-4" />
            Abrechnung anlegen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-6 pb-28 md:pb-0">
      <PageHeader
        title="FinanzBuddy"
        description="Abrechnungen einfach im Griff."
        icon={pageVisuals.financeBrain.icon}
        tone={pageVisuals.financeBrain.tone}
      />

      {isAdmin ? (
        <Card tone="green" className="hidden md:block">
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-medium text-[var(--brand-finance)]">
              Neue Abrechnung
            </p>
            {renderCreateForm()}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card className="border-border shadow-[0_2px_4px_rgba(20,32,28,0.06),0_10px_28px_rgba(20,32,28,0.1)]">
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            <p className="mr-auto text-sm text-muted-foreground">
              FinanzBuddy-Backup
            </p>
            <a
              href="/api/finance-ledgers/backup"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1.5"
              )}
            >
              <Download className="size-3.5" />
              Export
            </a>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importBackup(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => importRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Import
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {statusMsg ? (
        <p className="text-sm text-muted-foreground">{statusMsg}</p>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Meine Abrechnungen
        </h2>

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade Abrechnungen…</p>
        ) : ledgers.length === 0 ? (
          <Card className="border-border/60 bg-card shadow-[0_4px_16px_rgba(20,32,28,0.05)]">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm text-muted-foreground">
                Noch keine Abrechnungen.
              </p>
              {isAdmin ? (
                <Button
                  className="w-full bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90 md:hidden"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="mr-2 size-4" />
                  Erste Abrechnung anlegen
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ledgers.map((ledger) => {
              const kind = ledger.ledger_kind === "normal" ? "normal" : "split";
              return (
                <div
                  key={ledger.id}
                  className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_2px_4px_rgba(20,32,28,0.06),0_10px_28px_rgba(20,32,28,0.1)]"
                >
                  <div
                    className="h-36 bg-gradient-to-br from-[var(--brand-finance-soft)] to-emerald-100 bg-cover bg-center"
                    style={
                      ledger.cover_url
                        ? { backgroundImage: `url(${ledger.cover_url})` }
                        : undefined
                    }
                  />
                  <div className="relative flex flex-1 flex-col p-4">
                    {isAdmin ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-3 right-3 z-10"
                        onClick={() =>
                          void removeLedger(ledger.id, ledger.title)
                        }
                        aria-label="Löschen"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    ) : null}

                    <div
                      className={cn(
                        "flex min-h-0 flex-1 items-start gap-3",
                        isAdmin && "pr-10"
                      )}
                    >
                      <IconCircle
                        icon={pageVisuals.financeBrain.icon}
                        tone="green"
                        size="lg"
                        className="rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">
                          {ledger.title}
                        </p>
                        {ledger.trip_title ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Reise: {ledger.trip_title}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {LEDGER_KIND_LABELS[kind]}
                          </span>
                          <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {ledger.base_currency}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/finance-brain/${ledger.id}`}
                      className="mt-4 flex w-full items-center justify-center rounded-xl bg-[var(--brand-finance-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-finance)] transition-colors hover:opacity-90"
                    >
                      Öffnen
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isAdmin ? (
        <>
          <SoftFab
            className="md:hidden"
            onClick={() => setCreateOpen(true)}
            aria-label="Neue Abrechnung"
          >
            <Plus className="size-6" />
          </SoftFab>

          <Sheet open={createOpen} onOpenChange={setCreateOpen}>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Neue Abrechnung</SheetTitle>
                <SheetDescription>
                  Split oder normales Kassenbuch anlegen.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 pb-6">
                {renderCreateForm(true)}
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </div>
  );
}
