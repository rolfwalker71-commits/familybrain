"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, CreditCard, Receipt, Store } from "lucide-react";
import type {
  CreditCardOverview,
  CreditCardStatement,
  MerchantTotal,
} from "@/lib/knowledge/credit-cards";
import { formatMoney } from "@/lib/finance-brain/format";
import { toSwissDate } from "@/lib/utils/dates";
import { PageHeader } from "@/components/layout/page-primitives";
import { IconCircle, pageVisuals } from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";

function chf(value: number | null | undefined, currency = "CHF"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatMoney(value, currency);
}

function MerchantLogo({
  label,
  logoUrl,
  size = "sm",
}: {
  label: string;
  logoUrl: string | null;
  size?: "sm" | "md";
}) {
  const [failed, setFailed] = useState(false);
  const box = size === "md" ? "size-8" : "size-6";
  if (!logoUrl || failed) {
    return (
      <span
        className={cn(
          box,
          "flex shrink-0 items-center justify-center rounded-md bg-[var(--brand-finance-soft)] text-[10px] font-bold uppercase text-[var(--brand-finance)]"
        )}
        aria-hidden
      >
        {label.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      className={cn(box, "shrink-0 rounded-md object-contain")}
      onError={() => setFailed(true)}
    />
  );
}

function StatementRow({ statement }: { statement: CreditCardStatement }) {
  const [open, setOpen] = useState(false);
  const missingCharges = statement.charges.length === 0;

  return (
    <li className="border-b border-border/50 last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconCircle icon={Receipt} tone="green" size="sm" shape="rounded" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {statement.title}
          </span>
          <span className="text-xs text-muted-foreground">
            {statement.date ? toSwissDate(statement.date.slice(0, 10)) : "Ohne Datum"}
            {" · "}
            {missingCharges
              ? "keine Positionen erkannt"
              : `${statement.charges.length} Positionen`}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {chf(statement.total, statement.currency)}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="border-t border-border/40 bg-muted/10 px-3 py-2">
          {missingCharges ? (
            <p className="py-1 text-xs text-muted-foreground">
              Für diese Abrechnung wurden noch keine Belastungspositionen
              extrahiert. Dokument neu analysieren, damit die einzelnen
              Buchungen erscheinen.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {statement.charges.map((charge, i) => (
                <li
                  key={`${statement.documentId}-${i}`}
                  className="flex items-center gap-2.5 py-1.5"
                >
                  <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {charge.date ? toSwissDate(charge.date).slice(0, 6) : "—"}
                  </span>
                  <MerchantLogo
                    label={charge.merchantLabel}
                    logoUrl={charge.merchantLogoUrl}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {charge.description}
                    </span>
                    {charge.foreignAmount != null && charge.foreignCurrency ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {chf(charge.foreignAmount, charge.foreignCurrency)}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {chf(charge.amount, charge.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/40 pt-2 text-xs">
            <Link
              href={`/documents/${statement.documentId}`}
              className="font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
            >
              Beleg öffnen
            </Link>
            <span className="tabular-nums text-muted-foreground">
              Summe Positionen {chf(statement.chargeSum, statement.currency)}
            </span>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function MerchantList({ merchants }: { merchants: MerchantTotal[] }) {
  const max = merchants[0]?.total ?? 0;
  if (merchants.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Noch keine Positionen — Händlersummen erscheinen, sobald Abrechnungen
        mit Belastungszeilen analysiert sind.
      </p>
    );
  }
  return (
    <ul className="space-y-2.5">
      {merchants.map((m) => (
        <li key={m.key} className="space-y-1">
          <div className="flex items-center gap-2">
            <MerchantLogo label={m.label} logoUrl={m.logoUrl} />
            <span className="min-w-0 flex-1 truncate text-sm">{m.label}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {chf(m.total)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--brand-finance)]"
                style={{
                  width: `${max > 0 ? Math.max(2, (m.total / max) * 100) : 0}%`,
                }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {m.count}×
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CreditCardsClient({
  overview,
  description,
}: {
  overview: CreditCardOverview;
  description?: string | null;
}) {
  const [year, setYear] = useState<number | null>(
    overview.years[0] ?? null
  );
  const [openCards, setOpenCards] = useState<Set<string>>(
    () => new Set(overview.groups.slice(0, 1).map((g) => g.cardKey))
  );

  const filtered = useMemo(() => {
    if (year == null) return overview.groups;
    return overview.groups
      .map((g) => {
        const statements = g.statements.filter((s) => s.year === year);
        return {
          ...g,
          statements,
          total: statements.reduce((sum, s) => sum + (s.total ?? 0), 0),
          chargeCount: statements.reduce((n, s) => n + s.charges.length, 0),
        };
      })
      .filter((g) => g.statements.length > 0)
      .sort((a, b) => b.total - a.total);
  }, [overview.groups, year]);

  const merchants = useMemo(() => {
    if (year == null) return overview.merchants;
    const byKey = new Map<string, MerchantTotal>();
    for (const group of filtered) {
      for (const statement of group.statements) {
        for (const charge of statement.charges) {
          if (charge.amount == null) continue;
          const entry = byKey.get(charge.merchantKey) || {
            key: charge.merchantKey,
            label: charge.merchantLabel,
            logoUrl: charge.merchantLogoUrl,
            total: 0,
            count: 0,
          };
          entry.total += charge.amount;
          entry.count += 1;
          byKey.set(charge.merchantKey, entry);
        }
      }
    }
    return [...byKey.values()].sort((a, b) => b.total - a.total);
  }, [filtered, overview.merchants, year]);

  const yearTotal = filtered.reduce((sum, g) => sum + g.total, 0);
  const statementCount = filtered.reduce(
    (n, g) => n + g.statements.length,
    0
  );
  const missing = filtered.reduce(
    (n, g) => n + g.statements.filter((s) => s.charges.length === 0).length,
    0
  );

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Kreditkarten"
        description={
          description ||
          "Belastungen je Karte — von der Abrechnung bis zur einzelnen Position."
        }
        icon={pageVisuals.knowledge.icon}
        tone="green"
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/knowledge"
          className="text-muted-foreground underline-offset-2 hover:underline"
        >
          ← Wissen
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link
          href="/documents?category=Kreditkarten"
          className="text-muted-foreground underline-offset-2 hover:underline"
        >
          Flache Liste
        </Link>
      </div>

      {overview.years.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {overview.years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm tabular-nums transition-colors",
                year === y
                  ? "border-[var(--brand-finance)] bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]"
                  : "border-border/70 text-muted-foreground hover:bg-muted/40"
              )}
            >
              {y}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setYear(null)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              year == null
                ? "border-[var(--brand-finance)] bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]"
                : "border-border/70 text-muted-foreground hover:bg-muted/40"
            )}
          >
            Alle Jahre
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Kreditkartenabrechnungen
              {year != null ? ` für ${year}` : ""} vorhanden.
            </p>
          ) : (
            filtered.map((group) => {
              const open = openCards.has(group.cardKey);
              return (
                <section
                  key={group.cardKey}
                  className="overflow-hidden rounded-2xl border border-border/70 bg-card"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left sm:px-4"
                    aria-expanded={open}
                    onClick={() =>
                      setOpenCards((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.cardKey)) next.delete(group.cardKey);
                        else next.add(group.cardKey);
                        return next;
                      })
                    }
                  >
                    <IconCircle
                      icon={CreditCard}
                      tone="green"
                      size="md"
                      shape="rounded"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {group.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {group.statements.length}{" "}
                        {group.statements.length === 1
                          ? "Abrechnung"
                          : "Abrechnungen"}
                        {group.chargeCount > 0
                          ? ` · ${group.chargeCount} Positionen`
                          : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">
                        {chf(group.total)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {year ?? "alle Jahre"}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180"
                      )}
                      aria-hidden
                    />
                  </button>
                  {open ? (
                    <ul className="border-t border-border/60">
                      {group.statements.map((statement) => (
                        <StatementRow
                          key={statement.documentId}
                          statement={statement}
                        />
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })
          )}

          {missing > 0 ? (
            <p className="text-xs text-muted-foreground">
              {missing}{" "}
              {missing === 1 ? "Abrechnung hat" : "Abrechnungen haben"} noch
              keine Belastungspositionen. Nach einer erneuten Analyse erscheinen
              die einzelnen Buchungen und fliessen in die Händlersummen ein.
            </p>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {year != null ? `Total ${year}` : "Total alle Jahre"}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {chf(yearTotal)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {statementCount}{" "}
              {statementCount === 1 ? "Abrechnung" : "Abrechnungen"} ·{" "}
              {filtered.length} {filtered.length === 1 ? "Karte" : "Karten"}
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <IconCircle icon={Store} tone="green" size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  Händler · {year ?? "alle Jahre"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Summiert über alle Karten
                </p>
              </div>
            </div>
            <MerchantList merchants={merchants.slice(0, 20)} />
          </div>

          {overview.yearTotals.length > 1 ? (
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="mb-2 text-sm font-semibold">Jahresvergleich</p>
              <ul className="space-y-1.5">
                {overview.yearTotals.map((yt) => (
                  <li
                    key={yt.year}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <button
                      type="button"
                      className={cn(
                        "tabular-nums underline-offset-2 hover:underline",
                        yt.year === year && "font-semibold"
                      )}
                      onClick={() => setYear(yt.year)}
                    >
                      {yt.year}
                    </button>
                    <span className="tabular-nums text-muted-foreground">
                      {chf(yt.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
