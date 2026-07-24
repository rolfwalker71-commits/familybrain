"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  updated_at: string;
};

export function FinanceLedgersListClient() {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("CHF");
  const [ledgerKind, setLedgerKind] = useState<LedgerKind>("split");
  const [memberNames, setMemberNames] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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

  useEffect(() => {
    void load();
  }, []);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anlegen fehlgeschlagen");
      setTitle("");
      setMemberNames("");
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

  function CreateForm({ compact }: { compact?: boolean }) {
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
          <div className={cn("space-y-1.5", !compact && "sm:col-span-2")}>
            <Label htmlFor={compact ? "memberNamesMobile" : "memberNames"}>
              Teilnehmer (optional)
            </Label>
            <Input
              id={compact ? "memberNamesMobile" : "memberNames"}
              placeholder="Anna, Ben, Chris"
              value={memberNames}
              onChange={(e) => setMemberNames(e.target.value)}
            />
          </div>
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
        title="FinanzBrain"
        description="Abrechnungen einfach im Griff."
        icon={pageVisuals.financeBrain.icon}
        tone={pageVisuals.financeBrain.tone}
      />

      {/* Desktop create form */}
      <Card tone="green" className="hidden md:block">
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-medium text-[var(--brand-finance)]">
            Neue Abrechnung
          </p>
          <CreateForm />
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
              <Button
                className="w-full bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90 md:hidden"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-2 size-4" />
                Erste Abrechnung anlegen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {ledgers.map((ledger) => {
              const kind = ledger.ledger_kind === "normal" ? "normal" : "split";
              return (
                <div
                  key={ledger.id}
                  className="relative rounded-2xl border border-border/60 bg-card p-4 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-3 right-3 z-10"
                    onClick={() => void removeLedger(ledger.id, ledger.title)}
                    aria-label="Löschen"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>

                  <div className="flex items-start gap-3 pr-10">
                    <IconCircle
                      icon={pageVisuals.financeBrain.icon}
                      tone="green"
                      size="lg"
                      className="rounded-2xl"
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
              );
            })}
          </div>
        )}
      </div>

      <SoftFab
        accent="green"
        label="Neue Abrechnung"
        aria-label="Neue Abrechnung"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="size-6" />
      </SoftFab>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Neue Abrechnung</SheetTitle>
            <SheetDescription>
              Split oder normales Haushaltsbuch anlegen.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <CreateForm compact />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
