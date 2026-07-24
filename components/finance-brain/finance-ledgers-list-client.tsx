"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
            className="w-full sm:w-auto"
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
    <div className="relative space-y-6 pb-20 md:pb-0">
      <PageHeader
        title="FinanzBrain"
        description="Split-Abrechnungen oder normales Haushaltsbuch für Ein- und Ausgaben"
        icon={pageVisuals.financeBrain.icon}
        tone={pageVisuals.financeBrain.tone}
      />

      {/* Desktop create form */}
      <Card tone="green" className="hidden rounded-md shadow-sm md:block">
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-medium">Neue Abrechnung</p>
          <CreateForm />
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Meine Abrechnungen
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="md:hidden"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1 size-4" />
            Neu
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade Abrechnungen…</p>
        ) : ledgers.length === 0 ? (
          <Card tone="green" className="rounded-md shadow-sm">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm text-muted-foreground">
                Noch keine Abrechnungen.
              </p>
              <Button
                className="w-full md:hidden"
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
                <Card
                  key={ledger.id}
                  tone="green"
                  className="rounded-md shadow-sm"
                >
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <IconCircle
                        icon={pageVisuals.financeBrain.icon}
                        tone="green"
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/finance-brain/${ledger.id}`}
                          className="font-medium hover:underline"
                        >
                          {ledger.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {LEDGER_KIND_LABELS[kind]} · {ledger.base_currency}
                          {ledger.trip_title
                            ? ` · Reise: ${ledger.trip_title}`
                            : ""}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge variant="secondary">
                            {LEDGER_KIND_LABELS[kind]}
                          </Badge>
                          <Badge variant="outline">{ledger.base_currency}</Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 sm:hidden"
                        onClick={() =>
                          void removeLedger(ledger.id, ledger.title)
                        }
                        aria-label="Löschen"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-auto">
                      <Link
                        href={`/finance-brain/${ledger.id}`}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "flex-1 sm:flex-none"
                        )}
                      >
                        Öffnen
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="hidden sm:inline-flex"
                        onClick={() =>
                          void removeLedger(ledger.id, ledger.title)
                        }
                        aria-label="Löschen"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile FAB */}
      <button
        type="button"
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg md:hidden"
        aria-label="Neue Abrechnung"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="size-6" />
      </button>

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
