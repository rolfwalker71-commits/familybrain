"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HandCoins, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";
import { formatSignedMoney } from "@/lib/finance-brain/format";
import { cn } from "@/lib/utils";

type LedgerSummary = {
  id: number;
  title: string;
  base_currency: string;
};

type Balance = {
  memberId: number;
  displayName: string;
  netBalance: number;
};

export function TripFinanceLedgerCard({ tripId }: { tripId: number }) {
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/finance-ledger`);
      const data = await res.json();
      if (res.ok && data.ledger) {
        setLedger(data.ledger);
        setBalances(data.balances || []);
      } else {
        setLedger(null);
        setBalances([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tripId]);

  async function createLedger() {
    setCreating(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/finance-ledger`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");
      await load();
      if (data.ledger?.id) {
        window.location.assign(`/finance-brain/${data.ledger.id}`);
      }
    } catch {
      /* parent shows errors */
    } finally {
      setCreating(false);
    }
  }

  if (loading) return null;

  return (
    <Card tone="green" className="rounded-md shadow-sm">
      <CardHeader
        tone="green"
        className="flex flex-row items-center justify-between pb-2"
      >
        <CardTitle className="flex items-center gap-2 text-base">
          <IconCircle icon={HandCoins} tone="green" size="sm" />
          Abrechnung
        </CardTitle>
        {ledger ? (
          <Link
            href={`/finance-brain/${ledger.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Öffnen
          </Link>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void createLedger()}
            disabled={creating}
          >
            <Plus className="mr-1 size-4" />
            Anlegen
          </Button>
        )}
      </CardHeader>
      {ledger ? (
        <CardContent className="space-y-2 pt-0">
          <p className="text-sm text-muted-foreground">{ledger.title}</p>
          {balances.length > 0 ? (
            <div className="space-y-1">
              {balances.slice(0, 4).map((b) => (
                <div
                  key={b.memberId}
                  className="flex justify-between rounded-md border border-emerald-200/70 bg-white/70 px-2 py-1 text-sm"
                >
                  <span>{b.displayName}</span>
                  <span
                    className={
                      b.netBalance > 0
                        ? "font-semibold text-emerald-700"
                        : b.netBalance < 0
                          ? "font-semibold text-rose-600"
                          : "text-muted-foreground"
                    }
                  >
                    {formatSignedMoney(b.netBalance, ledger.base_currency)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Noch keine Teilnehmer oder Ausgaben.
            </p>
          )}
        </CardContent>
      ) : (
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            Geteilte Kosten für diese Reise erfassen (Settle-Up).
          </p>
        </CardContent>
      )}
    </Card>
  );
}
