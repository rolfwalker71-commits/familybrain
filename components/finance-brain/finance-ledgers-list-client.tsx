"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Receipt, Trash2 } from "lucide-react";
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
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { COMMON_CURRENCIES } from "@/lib/finance-brain/constants";
import { cn } from "@/lib/utils";

type Ledger = {
  id: number;
  title: string;
  base_currency: string;
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
  const [memberNames, setMemberNames] = useState("");
  const [creating, setCreating] = useState(false);

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
          memberNames: names.length ? names : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anlegen fehlgeschlagen");
      setTitle("");
      setMemberNames("");
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="FinanzBrain"
        description="Geteilte Abrechnungen – Ausgaben splitten und Schulden ausgleichen"
        icon={pageVisuals.financeBrain.icon}
        tone={pageVisuals.financeBrain.tone}
      />

      <Card className="rounded-md border-border/80 shadow-sm">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ledgerTitle">Neue Abrechnung</Label>
            <Input
              id="ledgerTitle"
              placeholder="z.B. Miami 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Basiswährung</Label>
            <Select
              value={baseCurrency}
              onValueChange={(v) => {
                if (v == null) return;
                setBaseCurrency(v);
              }}
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
          <div className="space-y-1.5">
            <Label htmlFor="memberNames">Teilnehmer (optional)</Label>
            <Input
              id="memberNames"
              placeholder="Anna, Ben, Chris"
              value={memberNames}
              onChange={(e) => setMemberNames(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={() => void createLedger()} disabled={creating || !title.trim()}>
              <Plus className="mr-2 size-4" />
              Abrechnung anlegen
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade Abrechnungen…</p>
      ) : ledgers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Abrechnungen. Lege oben eine neue an.
        </p>
      ) : (
        <div className="grid gap-3">
          {ledgers.map((ledger) => (
            <Card key={ledger.id} className="rounded-md border-border/80 shadow-sm">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <Receipt className="size-5 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/finance-brain/${ledger.id}`}
                    className="font-medium hover:underline"
                  >
                    {ledger.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {ledger.base_currency}
                    {ledger.trip_title ? ` · Reise: ${ledger.trip_title}` : ""}
                  </p>
                </div>
                <Badge variant="secondary">{ledger.base_currency}</Badge>
                <Link
                  href={`/finance-brain/${ledger.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Öffnen
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void removeLedger(ledger.id, ledger.title)}
                  aria-label="Löschen"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
