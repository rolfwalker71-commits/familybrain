"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  CreditCard,
  Eye,
  EyeOff,
  Receipt,
  Sparkles,
  Store,
} from "lucide-react";
import type {
  CreditCardOverview,
  CreditCardStatement,
  MerchantTotal,
} from "@/lib/knowledge/credit-cards";
import { formatMoney } from "@/lib/finance-brain/format";
import { toSwissDate } from "@/lib/utils/dates";
import { Button } from "@/components/ui/button";
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
  refresh = 0,
}: {
  label: string;
  logoUrl: string | null;
  size?: "sm" | "md" | "lg";
  refresh?: number;
}) {
  const [failed, setFailed] = useState(false);
  const box =
    size === "lg" ? "size-12" : size === "md" ? "size-8" : "size-6";
  if (!logoUrl || failed) {
    return (
      <span
        className={cn(
          box,
          "flex shrink-0 items-center justify-center rounded-md bg-[var(--brand-finance-soft)] text-[0.625rem] font-bold uppercase text-[var(--brand-finance)]"
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
      src={`${logoUrl}?v=${refresh}`}
      alt=""
      className={cn(box, "shrink-0 rounded-md object-contain")}
      onError={() => setFailed(true)}
    />
  );
}

function StatementRow({
  statement,
  onDecision,
  busyKey,
  logoRefresh,
}: {
  statement: CreditCardStatement;
  onDecision: (
    scope: "merchant" | "charge",
    key: string,
    excluded: boolean
  ) => Promise<void>;
  busyKey: string | null;
  logoRefresh: number;
}) {
  const [open, setOpen] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const missingCharges = statement.charges.length === 0;
  const visibleCharges = statement.charges.filter((charge) => !charge.excluded);
  const hiddenCharges = statement.charges.filter((charge) => charge.excluded);

  function renderCharge(
    charge: CreditCardStatement["charges"][number],
    excluded: boolean
  ) {
    return (
      <li
        key={charge.key}
        className={cn(
          "flex items-center gap-2.5 py-1.5",
          excluded && "text-muted-foreground"
        )}
      >
        <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
          {charge.date ? toSwissDate(charge.date).slice(0, 6) : "—"}
        </span>
        <MerchantLogo
          key={`${charge.merchantKey}:${logoRefresh}`}
          label={charge.merchantLabel}
          logoUrl={charge.merchantLogoUrl}
          refresh={logoRefresh}
        />
        <span className="min-w-0 flex-1">
          <span className={cn("block break-words text-sm leading-snug", excluded && "line-through")}>
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
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 shrink-0"
          disabled={
            busyKey === `charge:${charge.key}` || charge.excludedByMerchant
          }
          title={
            charge.excludedByMerchant
              ? "Dieser Händler ist vollständig ausgeblendet"
              : excluded
                ? "Wieder in Auswertung aufnehmen"
                : "Aus Auswertung ausblenden"
          }
          aria-label={excluded ? "Wieder einblenden" : "Ausblenden"}
          onClick={() => void onDecision("charge", charge.key, !excluded)}
        >
          {excluded ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </Button>
      </li>
    );
  }

  return (
    <li className="border-b border-border/50 last:border-0">
      <Button
        type="button"
        variant="ghost"
        className="h-auto w-full items-center justify-start gap-3 rounded-none px-3 py-2.5 text-left font-normal hover:bg-muted/30"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconCircle icon={Receipt} tone="green" size="sm" shape="rounded" />
        <span className="min-w-0 flex-1">
          <Link
            href={`/documents/${statement.documentId}`}
            className="block break-words text-sm font-semibold leading-snug text-foreground underline-offset-2 hover:underline"
            title="Beleg öffnen"
            onClick={(event) => event.stopPropagation()}
          >
            {statement.title}
          </Link>
          <span className="text-xs text-muted-foreground">
            {statement.date ? toSwissDate(statement.date.slice(0, 10)) : "Ohne Datum"}
            {" · "}
            {missingCharges
              ? "keine Positionen erkannt"
              : `${visibleCharges.length} Positionen${
                  hiddenCharges.length > 0
                    ? ` · ${hiddenCharges.length} ausgeblendet`
                    : ""
                }`}
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
      </Button>

      {open ? (
        <div className="border-t border-border/40 bg-muted/10 px-3 py-2">
          {missingCharges ? (
            <p className="py-1 text-xs text-muted-foreground">
              Für diese Abrechnung wurden noch keine Belastungspositionen
              extrahiert. Dokument neu analysieren, damit die einzelnen
              Buchungen erscheinen.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border/40">
                {visibleCharges.map((charge) => renderCharge(charge, false))}
              </ul>
              {hiddenCharges.length > 0 ? (
                <div className="mt-2 overflow-hidden rounded-lg border border-border/50 bg-muted/20">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full items-center justify-between gap-3 rounded-none px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                    aria-expanded={hiddenOpen}
                    onClick={() => setHiddenOpen((value) => !value)}
                  >
                    <span className="flex items-center gap-2">
                      <EyeOff className="size-3.5" />
                      Ausgeblendet ({hiddenCharges.length})
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform",
                        hiddenOpen && "rotate-180"
                      )}
                    />
                  </Button>
                  {hiddenOpen ? (
                    <ul className="divide-y divide-border/40 border-t border-border/40 px-2">
                      {hiddenCharges.map((charge) => renderCharge(charge, true))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/40 pt-2 text-xs">
            <Link
              href={`/documents/${statement.documentId}`}
              className="font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
            >
              Beleg öffnen
            </Link>
            <span className="tabular-nums text-muted-foreground">
              Auswertung {chf(statement.includedTotal, statement.currency)}
            </span>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function MerchantList({
  merchants,
  onDecision,
  busyKey,
  logoRefresh,
}: {
  merchants: MerchantTotal[];
  onDecision: (
    scope: "merchant" | "charge",
    key: string,
    excluded: boolean
  ) => Promise<void>;
  busyKey: string | null;
  logoRefresh: number;
}) {
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const visible = merchants.filter((merchant) => !merchant.excluded);
  const hidden = merchants.filter((merchant) => merchant.excluded);
  const max = visible[0]?.total ?? 0;
  if (merchants.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Noch keine Positionen — Händlersummen erscheinen, sobald Abrechnungen
        mit Belastungszeilen analysiert sind.
      </p>
    );
  }
  function renderMerchant(m: MerchantTotal, excluded: boolean) {
    const amount = excluded ? m.rawTotal : m.total;
    const count = excluded ? m.rawCount : m.count;
    return (
      <li key={m.key} className={cn("space-y-1", excluded && "opacity-70")}>
        <div className="flex items-center gap-2">
          <MerchantLogo
            key={`${m.key}:${logoRefresh}`}
            label={m.label}
            logoUrl={m.logoUrl}
            size="lg"
            refresh={logoRefresh}
          />
          <span className={cn("min-w-0 flex-1 break-words text-sm leading-snug", excluded && "line-through")}>
            {m.label}
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {chf(amount)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0"
            disabled={busyKey === `merchant:${m.key}`}
            title={excluded ? "Händler wieder einbeziehen" : "Händler aus Auswertung ausblenden"}
            aria-label={excluded ? "Händler wieder einblenden" : "Händler ausblenden"}
            onClick={() => void onDecision("merchant", m.key, !excluded)}
          >
            {excluded ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </Button>
        </div>
        <div className="flex items-center gap-2 pr-7">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            {!excluded ? (
              <div
                className="h-full rounded-full bg-[var(--brand-finance)]"
                style={{
                  width: `${max > 0 ? Math.max(2, (m.total / max) * 100) : 0}%`,
                }}
              />
            ) : null}
          </div>
          <span className="w-8 shrink-0 text-right text-[0.6875rem] tabular-nums text-muted-foreground">
            {count}×
          </span>
        </div>
      </li>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">{visible.map((m) => renderMerchant(m, false))}</ul>
      {hidden.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/20">
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full items-center justify-between gap-3 rounded-none px-3 py-2 text-left text-xs font-medium text-muted-foreground"
            aria-expanded={hiddenOpen}
            onClick={() => setHiddenOpen((value) => !value)}
          >
            <span className="flex items-center gap-2">
              <EyeOff className="size-3.5" />
              Ausgeblendet ({hidden.length})
            </span>
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                hiddenOpen && "rotate-180"
              )}
            />
          </Button>
          {hiddenOpen ? (
            <ul className="space-y-2.5 border-t border-border/40 p-2">
              {hidden.map((m) => renderMerchant(m, true))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CreditCardsClient({
  overview,
  description,
}: {
  overview: CreditCardOverview;
  description?: string | null;
}) {
  const [model, setModel] = useState(overview);
  const [year, setYear] = useState<number | null>(
    overview.years[0] ?? null
  );
  const [openCards, setOpenCards] = useState<Set<string>>(
    () => new Set(overview.groups.slice(0, 1).map((g) => g.cardKey))
  );
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoProgress, setLogoProgress] = useState<string | null>(null);
  const [logoRefresh, setLogoRefresh] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  async function updateDecision(
    scope: "merchant" | "charge",
    key: string,
    excluded: boolean
  ) {
    const busy = `${scope}:${key}`;
    setDecisionBusy(busy);
    setActionError(null);
    try {
      const response = await fetch("/api/knowledge/credit-cards/decision", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, key, excluded }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Speichern fehlgeschlagen");
      if (body.overview) setModel(body.overview as CreditCardOverview);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen"
      );
    } finally {
      setDecisionBusy(null);
    }
  }

  async function generateAllLogos() {
    const unique = new Map<string, string>();
    for (const merchant of model.merchants) {
      unique.set(merchant.key, merchant.label);
    }
    for (const group of model.groups) {
      for (const statement of group.statements) {
        for (const charge of statement.charges) {
          unique.set(charge.merchantKey, charge.merchantLabel);
        }
      }
    }
    const entries = [...unique.entries()];
    setLogoBusy(true);
    setActionError(null);
    try {
      for (let index = 0; index < entries.length; index += 1) {
        const [key, label] = entries[index]!;
        setLogoProgress(`${index + 1}/${entries.length} · ${label}`);
        const response = await fetch(
          `/api/merchants/logo/${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label }),
          }
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Logo für ${label} fehlgeschlagen`);
        }
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "AI-Logo fehlgeschlagen"
      );
    } finally {
      setLogoRefresh((value) => value + 1);
      setLogoBusy(false);
      setLogoProgress(null);
    }
  }

  const filtered = useMemo(() => {
    if (year == null) return model.groups;
    return model.groups
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
  }, [model.groups, year]);

  const merchants = useMemo(() => {
    if (year == null) return model.merchants;
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
            rawTotal: 0,
            rawCount: 0,
            excluded: true,
          };
          entry.rawTotal += charge.amount;
          entry.rawCount += 1;
          if (!charge.excluded) {
            entry.total += charge.amount;
            entry.count += 1;
            entry.excluded = false;
          }
          byKey.set(charge.merchantKey, entry);
        }
      }
    }
    return [...byKey.values()].sort((a, b) => b.total - a.total);
  }, [filtered, model.merchants, year]);

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

      {model.years.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {model.years.map((y) => (
            <Button
              key={y}
              type="button"
              variant="outline"
              className={cn(
                "h-auto rounded-full px-3 py-1.5 text-sm tabular-nums",
                year === y &&
                  "border-[var(--brand-finance)] bg-[var(--brand-finance-soft)] text-[var(--brand-finance)] hover:bg-[var(--brand-finance-soft)]"
              )}
              onClick={() => setYear(y)}
            >
              {y}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-auto rounded-full px-3 py-1.5 text-sm",
              year == null &&
                "border-[var(--brand-finance)] bg-[var(--brand-finance-soft)] text-[var(--brand-finance)] hover:bg-[var(--brand-finance-soft)]"
            )}
            onClick={() => setYear(null)}
          >
            Alle Jahre
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {actionError ? (
          <p className="text-sm text-destructive lg:col-span-2">{actionError}</p>
        ) : null}
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
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full items-center justify-start gap-3 rounded-none px-3 py-2.5 text-left font-normal sm:px-4"
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
                      <span className="block break-words font-semibold leading-snug">
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
                  </Button>
                  {open ? (
                    <ul className="border-t border-border/60">
                      {group.statements.map((statement) => (
                        <StatementRow
                          key={statement.documentId}
                          statement={statement}
                          onDecision={updateDecision}
                          busyKey={decisionBusy}
                          logoRefresh={logoRefresh}
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
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
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
            <div className="mb-3 flex items-start gap-2">
              <IconCircle
                icon={Store}
                tone="green"
                size="sm"
                className="h-16 w-16 [&_svg]:h-12 [&_svg]:w-12"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  Händler · {year ?? "alle Jahre"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Summiert über alle Karten
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2 text-xs font-medium text-[var(--brand-finance)] hover:bg-[var(--brand-finance-soft)]"
                disabled={logoBusy || merchants.length === 0}
                title="Alle Händlerlogos konsistent mit AI erzeugen"
                aria-label="AI-Logos erzeugen"
                onClick={() => void generateAllLogos()}
              >
                <Sparkles className={cn("size-4", logoBusy && "animate-pulse")} />
                <span>{logoBusy ? "Erzeuge…" : "AI-Logos"}</span>
              </Button>
            </div>
            {logoProgress ? (
              <p className="mb-3 text-xs text-muted-foreground">
                AI-Logos: {logoProgress}
              </p>
            ) : null}
            <MerchantList
              merchants={merchants}
              onDecision={updateDecision}
              busyKey={decisionBusy}
              logoRefresh={logoRefresh}
            />
          </div>

          {model.yearTotals.length > 1 ? (
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="mb-2 text-sm font-semibold">Jahresvergleich</p>
              <ul className="space-y-1.5">
                {model.yearTotals.map((yt) => (
                  <li
                    key={yt.year}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <Button
                      type="button"
                      variant="link"
                      className={cn(
                        "h-auto p-0 tabular-nums",
                        yt.year === year && "font-semibold"
                      )}
                      onClick={() => setYear(yt.year)}
                    >
                      {yt.year}
                    </Button>
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
