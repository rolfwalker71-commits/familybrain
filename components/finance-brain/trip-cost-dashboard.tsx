"use client";

import { PieChart, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";
import { formatMoney, formatSignedMoney } from "@/lib/finance-brain/format";
import { cn } from "@/lib/utils";

export type TripCostDashboardData = {
  baseCurrency: string;
  totalSpentBase: number;
  expenseCount: number;
  unlinkedCount: number;
  byPerson: Array<{
    memberId: number;
    displayName: string;
    paidBase: number;
    fairShareBase: number;
    deltaBase: number;
    netBalance: number;
  }>;
  byCategory: Array<{
    label: string;
    totalBase: number;
    count: number;
    sharePct: number;
  }>;
  byEventType: Array<{
    label: string;
    totalBase: number;
    count: number;
    sharePct: number;
  }>;
};

function ShareBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-[var(--brand-finance)] transition-[width]"
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function BucketList({
  title,
  buckets,
  currency,
}: {
  title: string;
  buckets: TripCostDashboardData["byCategory"];
  currency: string;
}) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-white px-3 py-2.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">Noch keine Daten.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border/50 bg-white px-3 py-2.5">
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-2 space-y-2.5">
        {buckets.map((b) => (
          <li key={b.label}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">{b.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatMoney(b.totalBase, currency)}
                <span className="ml-1.5 text-[11px]">{b.sharePct}%</span>
              </span>
            </div>
            <ShareBar value={b.sharePct} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TripCostDashboard({ data }: { data: TripCostDashboardData }) {
  const currency = data.baseCurrency;
  const perHead =
    data.byPerson.length > 0
      ? data.totalSpentBase / data.byPerson.length
      : 0;

  return (
    <Card
      tone="green"
      className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
    >
      <CardHeader tone="green" className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-[var(--brand-finance)]">
          <IconCircle icon={PieChart} tone="green" size="sm" />
          Reise-Kosten
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/50 bg-white px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Gesamtausgaben</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(data.totalSpentBase, currency)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {data.expenseCount} Ausgabe
              {data.expenseCount === 1 ? "" : "n"}
              {data.unlinkedCount > 0
                ? ` · ${data.unlinkedCount} ohne Aktivität`
                : ""}
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-white px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Pro Person (fair)</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(perHead, currency)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Total ÷ {data.byPerson.length || "–"} Teilnehmer
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-white px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Teilnehmer</p>
            <p className="flex items-center gap-1.5 text-lg font-semibold">
              <Users className="size-4 text-muted-foreground" />
              {data.byPerson.length}
            </p>
          </div>
        </div>

        {data.byPerson.length > 0 ? (
          <div className="rounded-xl border border-border/50 bg-white px-3 py-2.5">
            <p className="text-sm font-medium">Bezahlt vs. fairer Anteil</p>
            <ul className="mt-2 space-y-2">
              {data.byPerson.map((p) => (
                <li
                  key={p.memberId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                >
                  <span className="font-medium">{p.displayName}</span>
                  <span className="text-[11px] text-muted-foreground sm:order-last sm:w-full">
                    bezahlt {formatMoney(p.paidBase, currency)}
                    {" · "}
                    Anteil {formatMoney(p.fairShareBase, currency)}
                    {" · "}
                    Netto{" "}
                    <span
                      className={cn(
                        "font-semibold",
                        p.netBalance > 0
                          ? "text-[var(--brand-finance)]"
                          : p.netBalance < 0
                            ? "text-rose-600"
                            : ""
                      )}
                    >
                      {formatSignedMoney(p.netBalance, currency)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums font-semibold",
                      p.deltaBase > 0
                        ? "text-[var(--brand-finance)]"
                        : p.deltaBase < 0
                          ? "text-rose-600"
                          : "text-muted-foreground"
                    )}
                  >
                    {formatSignedMoney(p.deltaBase, currency)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Delta = bezahlt − Anteil (vor Rückzahlungen). Netto inkl.
              Rückzahlungen.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          <BucketList
            title="Nach Kategorie"
            buckets={data.byCategory}
            currency={currency}
          />
          <BucketList
            title="Nach Aktivitätstyp"
            buckets={data.byEventType}
            currency={currency}
          />
        </div>
      </CardContent>
    </Card>
  );
}
