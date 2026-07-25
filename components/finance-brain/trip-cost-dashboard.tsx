"use client";

import type { LucideIcon } from "lucide-react";
import { Link2Off, PieChart, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle, type IconTone } from "@/components/layout/icon-circle";
import {
  expenseVisualFromLabel,
  expenseVisualFromText,
} from "@/lib/finance-brain/expense-category";
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
  byCouple?: Array<{
    coupleId: number;
    name: string;
    paidBase: number;
    fairShareBase: number;
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

/** Map TravelBuddy event types / special buckets onto expense category visuals. */
const BUCKET_LABEL_ALIASES: Record<string, string> = {
  kreuzfahrt: "Schiff",
  mietauto: "Mietwagen",
  transfer: "Taxi / Transfer",
  unterkunft: "Hotel",
  zugreisen: "Bahn",
  bahn: "Bahn",
  ausflug: "Aktivität",
};

function visualForBucket(label: string): {
  icon: LucideIcon;
  tone: IconTone;
} {
  const trimmed = label.trim();
  if (!trimmed) {
    const fallback = expenseVisualFromLabel("Ausgabe");
    return { icon: fallback.icon, tone: fallback.tone };
  }
  if (/nicht mit timeline/i.test(trimmed)) {
    return { icon: Link2Off, tone: "slate" };
  }
  const exact = expenseVisualFromLabel(trimmed);
  if (exact.label.toLowerCase() === trimmed.toLowerCase()) {
    return { icon: exact.icon, tone: exact.tone };
  }
  const aliasKey = trimmed.toLowerCase();
  const alias = BUCKET_LABEL_ALIASES[aliasKey];
  if (alias) {
    const fromAlias = expenseVisualFromLabel(alias);
    return { icon: fromAlias.icon, tone: fromAlias.tone };
  }
  const fromText = expenseVisualFromText(trimmed);
  return { icon: fromText.icon, tone: fromText.tone };
}

function ShareBar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
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
      <div className="rounded-lg border border-border/50 bg-white px-2.5 py-2">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Noch keine Daten.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border/50 bg-white px-2.5 py-2">
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-1.5 space-y-1.5">
        {buckets.map((b) => {
          const visual = visualForBucket(b.label);
          return (
            <li key={b.label}>
              <div className="flex items-center justify-between gap-2 text-sm leading-snug">
                <span className="flex min-w-0 items-center gap-1.5">
                  <IconCircle
                    icon={visual.icon}
                    tone={visual.tone}
                    size="sm"
                    className="shrink-0"
                  />
                  <span className="truncate font-medium">{b.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatMoney(b.totalBase, currency)}
                  <span className="ml-1.5 text-[11px]">{b.sharePct}%</span>
                </span>
              </div>
              <ShareBar value={b.sharePct} />
            </li>
          );
        })}
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
      size="sm"
      tone="green"
      className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
    >
      <CardHeader tone="green" className="py-1.5">
        <CardTitle className="flex items-center gap-2 text-[15px]! text-[var(--brand-finance)]">
          <IconCircle icon={PieChart} tone="green" size="sm" />
          Reise-Kosten
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/50 bg-white px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">Gesamtausgaben</p>
            <p className="text-base font-semibold tabular-nums leading-tight">
              {formatMoney(data.totalSpentBase, currency)}
            </p>
            <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
              {data.expenseCount} Ausgabe
              {data.expenseCount === 1 ? "" : "n"}
              {data.unlinkedCount > 0
                ? ` · ${data.unlinkedCount} nicht mit Timeline verknüpft`
                : ""}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-white px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">Pro Person (fair)</p>
            <p className="text-base font-semibold tabular-nums leading-tight">
              {formatMoney(perHead, currency)}
            </p>
            <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
              Total ÷ {data.byPerson.length || "–"} Teilnehmer
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-white px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">Teilnehmer</p>
            <p className="flex items-center gap-1.5 text-base font-semibold leading-tight">
              <Users className="size-3.5 text-muted-foreground" />
              {data.byPerson.length}
            </p>
          </div>
        </div>

        {data.byPerson.length > 0 ? (
          <div className="rounded-lg border border-border/50 bg-white px-2.5 py-2">
            <p className="text-sm font-medium">Bezahlt vs. fairer Anteil</p>
            <ul className="mt-1.5 space-y-1.5">
              {data.byPerson.map((p) => (
                <li
                  key={p.memberId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0 text-sm leading-snug"
                >
                  <span className="font-medium">{p.displayName}</span>
                  <span className="text-[10px] leading-tight text-muted-foreground sm:order-last sm:w-full">
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
            <p className="mt-1.5 text-[10px] leading-tight text-muted-foreground">
              Delta = bezahlt − Anteil (vor Rückzahlungen). Netto inkl.
              Rückzahlungen.
            </p>
          </div>
        ) : null}

        {data.byCouple && data.byCouple.length > 0 ? (
          <div className="rounded-lg border border-border/50 bg-white px-2.5 py-2">
            <p className="text-sm font-medium">Kosten je Paar</p>
            <ul className="mt-1.5 space-y-1.5">
              {data.byCouple.map((c) => (
                <li
                  key={c.coupleId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0 text-sm leading-snug"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-[10px] leading-tight text-muted-foreground sm:order-last sm:w-full">
                    bezahlt {formatMoney(c.paidBase, currency)}
                    {" · "}
                    Anteil {formatMoney(c.fairShareBase, currency)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums font-semibold",
                      c.netBalance > 0
                        ? "text-[var(--brand-finance)]"
                        : c.netBalance < 0
                          ? "text-rose-600"
                          : "text-muted-foreground"
                    )}
                  >
                    {formatSignedMoney(c.netBalance, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-2 lg:grid-cols-2">
          <BucketList
            title="Nach Kategorie"
            buckets={data.byCategory}
            currency={currency}
          />
          <BucketList
            title="Nach Timeline-Aktivität"
            buckets={data.byEventType}
            currency={currency}
          />
        </div>
      </CardContent>
    </Card>
  );
}
