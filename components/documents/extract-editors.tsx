"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCHF } from "@/lib/utils/format";
import { toSwissDate } from "@/lib/utils/dates";

type DeadlineExtract = {
  id: number;
  title?: string | null;
  deadline_date?: string | null;
  manual_override?: number | null;
};

type FinanceExtract = {
  id: number;
  vendor?: string | null;
  amount?: number | null;
  currency?: string | null;
  due_date?: string | null;
  invoice_date?: string | null;
  manual_override?: number | null;
};

type WarrantyExtract = {
  id: number;
  product_name?: string | null;
  vendor?: string | null;
  manufacturer?: string | null;
  warranty_until?: string | null;
  manual_override?: number | null;
};

export function ExtractDeadlinesEditor({
  rows,
  onSaved,
}: {
  rows: DeadlineExtract[];
  onSaved: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Fristen.</p>;
  }

  async function save(id: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/deadlines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title: title.trim(),
          deadlineDate: date || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setEditingId(null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-sm">
      {error ? <p className="text-destructive">{error}</p> : null}
      {rows.map((d) => (
        <div key={d.id} className="space-y-1.5 rounded-lg border border-border/50 p-2">
          {editingId === d.id ? (
            <div className="flex flex-wrap gap-2">
              <Input
                className="h-8 min-w-[10rem] flex-1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Input
                type="date"
                className="h-8 w-36"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Button size="sm" disabled={busy} onClick={() => void save(d.id)}>
                Speichern
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {toSwissDate(String(d.deadline_date || ""))} – {String(d.title || "")}
              </span>
              {d.manual_override ? (
                <Badge variant="outline" className="text-[10px]">
                  Manuell
                </Badge>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setEditingId(d.id);
                  setTitle(d.title || "");
                  setDate(d.deadline_date || "");
                }}
              >
                Korrigieren
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ExtractFinanceEditor({
  rows,
  onSaved,
}: {
  rows: FinanceExtract[];
  onSaved: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Keine strukturierten Finanzpositionen.
      </p>
    );
  }

  async function save(id: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          vendor: vendor.trim() || null,
          amount: amount ? Number(amount) : null,
          dueDate: dueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setEditingId(null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-sm">
      {error ? <p className="text-destructive">{error}</p> : null}
      {rows.map((f) => (
        <div key={f.id} className="space-y-1.5 rounded-lg border border-border/50 p-2">
          {editingId === f.id ? (
            <div className="flex flex-wrap gap-2">
              <Input
                className="h-8 min-w-[8rem] flex-1"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Lieferant"
              />
              <Input
                className="h-8 w-28"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Betrag"
              />
              <Input
                type="date"
                className="h-8 w-36"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <Button size="sm" disabled={busy} onClick={() => void save(f.id)}>
                Speichern
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {f.vendor || "–"} ·{" "}
                {formatCHF(f.amount ?? null, f.currency || "CHF")}
                {f.due_date ? ` · fällig ${toSwissDate(f.due_date)}` : ""}
              </span>
              {f.manual_override ? (
                <Badge variant="outline" className="text-[10px]">
                  Manuell
                </Badge>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setEditingId(f.id);
                  setVendor(f.vendor || "");
                  setAmount(f.amount != null ? String(f.amount) : "");
                  setDueDate(f.due_date || "");
                }}
              >
                Korrigieren
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ExtractWarrantyEditor({
  rows,
  summaryFallback,
  onSaved,
}: {
  rows: WarrantyExtract[];
  summaryFallback?: React.ReactNode;
  onSaved: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [productName, setProductName] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) {
    return summaryFallback ?? (
      <p className="text-sm text-muted-foreground">Keine Garantie erkannt.</p>
    );
  }

  async function save(id: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/warranties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          productName: productName.trim() || null,
          warrantyUntil: until || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setEditingId(null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-sm">
      {error ? <p className="text-destructive">{error}</p> : null}
      {rows.map((w) => (
        <div key={w.id} className="space-y-1.5 rounded-lg border border-border/50 p-2">
          {editingId === w.id ? (
            <div className="flex flex-wrap gap-2">
              <Input
                className="h-8 min-w-[10rem] flex-1"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Produkt"
              />
              <Input
                type="date"
                className="h-8 w-36"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
              <Button size="sm" disabled={busy} onClick={() => void save(w.id)}>
                Speichern
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {w.product_name || w.vendor || "Garantie"}
                {w.warranty_until
                  ? ` · bis ${toSwissDate(w.warranty_until)}`
                  : ""}
              </span>
              {w.manual_override ? (
                <Badge variant="outline" className="text-[10px]">
                  Manuell
                </Badge>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setEditingId(w.id);
                  setProductName(w.product_name || "");
                  setUntil(w.warranty_until || "");
                }}
              >
                Korrigieren
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
