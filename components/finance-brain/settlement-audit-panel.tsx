"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Table2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";
import { formatMoney, formatSignedMoney } from "@/lib/finance-brain/format";
import {
  buildDebtGrid,
  buildShareMatrix,
  debtGridAmount,
  explainPairDebt,
  type PairDebtExplanation,
  type PairDebtLineKind,
  type PairDebtSettlement,
  type ShareMatrixExpense,
  type ShareMatrixMember,
} from "@/lib/finance-brain/settlement-audit";
import { expenseSettledBadge } from "@/lib/finance-brain/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Debt = {
  fromMemberId: number;
  toMemberId: number;
  amount: number;
};

const LINE_SECTION: Record<
  PairDebtLineKind,
  { title: (from: string, to: string) => string; tone: string }
> = {
  owe_from_booking: {
    title: (from, to) => `${from} schuldet aus Ausgaben von ${to}`,
    tone: "text-amber-900",
  },
  credit_from_booking: {
    title: (from, to) => `Abzüglich: ${to} schuldet aus Ausgaben von ${from}`,
    tone: "text-[var(--brand-finance)]",
  },
  settlement_paid: {
    title: (from, to) => `Rückzahlungen ${from} → ${to}`,
    tone: "text-[var(--brand-finance)]",
  },
  settlement_received: {
    title: (from, to) => `Rückzahlungen ${to} → ${from}`,
    tone: "text-amber-900",
  },
};

export function SettlementAuditPanel({
  expenses,
  members,
  debts,
  settlements = [],
  baseCurrency,
  balanceNetByMemberId,
}: {
  expenses: ShareMatrixExpense[];
  members: ShareMatrixMember[];
  debts: Debt[];
  settlements?: PairDebtSettlement[];
  baseCurrency: string;
  /** Optional: actual saldo nets (incl. settlements) for comparison. */
  balanceNetByMemberId?: Record<number, number>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState<{
    fromId: number;
    toId: number;
  } | null>(null);

  const matrix = useMemo(
    () => buildShareMatrix(expenses, members),
    [expenses, members]
  );
  const debtGrid = useMemo(
    () => buildDebtGrid(debts, members.map((m) => m.id)),
    [debts, members]
  );

  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of members) map.set(m.id, m.displayName);
    return map;
  }, [members]);

  const pairExplain = useMemo((): PairDebtExplanation | null => {
    if (!selectedPair) return null;
    return explainPairDebt(
      expenses,
      settlements,
      selectedPair.fromId,
      selectedPair.toId,
      nameById
    );
  }, [selectedPair, expenses, settlements, nameById]);

  if (members.length === 0 || matrix.rows.length === 0) {
    return null;
  }

  function togglePair(fromId: number, toId: number) {
    setSelectedPair((prev) =>
      prev && prev.fromId === fromId && prev.toId === toId
        ? null
        : { fromId, toId }
    );
  }

  return (
    <Card
      size="sm"
      tone="green"
      className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
    >
      <CardHeader tone="green" className="py-1.5">
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full items-center justify-between gap-2 px-0 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <CardTitle className="flex items-center gap-2 text-[0.9375rem]! text-[var(--brand-finance)]">
            <IconCircle icon={Table2} tone="green" size="sm" />
            Prüfen: Anteile
          </CardTitle>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-[var(--brand-finance)] transition-transform",
              open && "rotate-180"
            )}
          />
        </Button>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-4">
          <p className="text-[0.6875rem] leading-snug text-muted-foreground">
            Jede Zeile ist eine Buchung, jede Spalte ein Teilnehmer. Zellen =
            Anteil. Summe bezahlt / Anteil / Netto unten sollten zu «Saldo pro
            Person» passen (Netto hier ohne Rückzahlungen).
          </p>

          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full min-w-[36rem] border-collapse text-left text-[0.6875rem] leading-snug">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="sticky left-0 z-10 bg-muted/95 px-2 py-1.5 font-semibold">
                    Buchung
                  </th>
                  <th className="px-2 py-1.5 font-semibold">Bezahlt</th>
                  <th className="px-2 py-1.5 text-right font-semibold tabular-nums">
                    Betrag
                  </th>
                  {matrix.members.map((m) => (
                    <th
                      key={m.id}
                      className="px-2 py-1.5 text-right font-semibold"
                    >
                      {m.displayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr
                    key={row.expenseId}
                    className="border-b border-border/40 odd:bg-white even:bg-muted/10"
                  >
                    <td className="sticky left-0 z-10 max-w-[10rem] truncate bg-inherit px-2 py-1 font-medium">
                      {row.description}
                      {row.settledStatus !== 0 ? (
                        <span className="ml-1 text-[0.5625rem] font-normal text-muted-foreground">
                          ·{" "}
                          {expenseSettledBadge(row.settledStatus)?.label ??
                            "ausgeglichen"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {nameById.get(row.payerId) || `#${row.payerId}`}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {formatMoney(row.amountBase, baseCurrency)}
                    </td>
                    {matrix.members.map((m) => {
                      const share = row.sharesByMemberId[m.id] || 0;
                      const isPayer = row.payerId === m.id;
                      return (
                        <td
                          key={m.id}
                          className={cn(
                            "px-2 py-1 text-right tabular-nums",
                            isPayer && "bg-[var(--brand-finance-soft)]/50",
                            share === 0 && "text-muted-foreground/50"
                          )}
                        >
                          {share === 0
                            ? "—"
                            : formatMoney(share, baseCurrency)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/60 bg-muted/30">
                  <td
                    className="sticky left-0 z-10 bg-muted/95 px-2 py-1.5 font-semibold"
                    colSpan={2}
                  >
                    Summe Anteil
                  </td>
                  <td className="px-2 py-1.5" />
                  {matrix.members.map((m) => (
                    <td
                      key={m.id}
                      className="px-2 py-1.5 text-right font-semibold tabular-nums"
                    >
                      {formatMoney(
                        matrix.shareTotalByMemberId[m.id] || 0,
                        baseCurrency
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="bg-muted/20">
                  <td
                    className="sticky left-0 z-10 bg-muted/95 px-2 py-1.5 font-semibold"
                    colSpan={2}
                  >
                    Summe bezahlt
                  </td>
                  <td className="px-2 py-1.5" />
                  {matrix.members.map((m) => (
                    <td
                      key={m.id}
                      className="px-2 py-1.5 text-right font-semibold tabular-nums"
                    >
                      {formatMoney(
                        matrix.paidTotalByMemberId[m.id] || 0,
                        baseCurrency
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="bg-muted/30">
                  <td
                    className="sticky left-0 z-10 bg-muted/95 px-2 py-1.5 font-semibold"
                    colSpan={2}
                  >
                    Netto (bezahlt − Anteil)
                  </td>
                  <td className="px-2 py-1.5 text-right text-[0.625rem] text-muted-foreground">
                    Σ {formatSignedMoney(matrix.netSum, baseCurrency)}
                  </td>
                  {matrix.members.map((m) => {
                    const net = matrix.netByMemberId[m.id] || 0;
                    return (
                      <td
                        key={m.id}
                        className={cn(
                          "px-2 py-1.5 text-right font-semibold tabular-nums",
                          net > 0
                            ? "text-[var(--brand-finance)]"
                            : net < 0
                              ? "text-rose-600"
                              : "text-muted-foreground"
                        )}
                      >
                        {formatSignedMoney(net, baseCurrency)}
                      </td>
                    );
                  })}
                </tr>
                {balanceNetByMemberId ? (
                  <tr className="bg-muted/15">
                    <td
                      className="sticky left-0 z-10 bg-muted/95 px-2 py-1.5 text-muted-foreground"
                      colSpan={2}
                    >
                      Saldo inkl. Rückzahlungen
                    </td>
                    <td className="px-2 py-1.5" />
                    {matrix.members.map((m) => {
                      const net = balanceNetByMemberId[m.id] ?? 0;
                      return (
                        <td
                          key={m.id}
                          className={cn(
                            "px-2 py-1.5 text-right tabular-nums",
                            net > 0
                              ? "text-[var(--brand-finance)]"
                              : net < 0
                                ? "text-rose-600"
                                : "text-muted-foreground"
                          )}
                        >
                          {formatSignedMoney(net, baseCurrency)}
                        </td>
                      );
                    })}
                  </tr>
                ) : null}
              </tfoot>
            </table>
          </div>

          <div>
            <p className="mb-1.5 text-[0.6875rem] font-semibold text-foreground">
              Wer → wem (Nach Zahler)
            </p>
            <p className="mb-2 text-[0.6875rem] leading-snug text-muted-foreground">
              Zeile schuldet Spalte. Betrag antippen für die Aufschlüsselung
              (Buchungen + Rückzahlungen).
            </p>
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full min-w-[20rem] border-collapse text-left text-[0.6875rem]">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40">
                    <th className="px-2 py-1.5 font-semibold">Von \ An</th>
                    {members.map((m) => (
                      <th
                        key={m.id}
                        className="px-2 py-1.5 text-right font-semibold"
                      >
                        {m.displayName}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right font-semibold">Σ</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((from) => (
                    <tr
                      key={from.id}
                      className="border-b border-border/40 odd:bg-white even:bg-muted/10"
                    >
                      <td className="px-2 py-1 font-medium">{from.displayName}</td>
                      {members.map((to) => {
                        if (from.id === to.id) {
                          return (
                            <td
                              key={to.id}
                              className="px-2 py-1 text-center text-muted-foreground/40"
                            >
                              ·
                            </td>
                          );
                        }
                        const amt = debtGridAmount(debtGrid, from.id, to.id);
                        const isSelected =
                          selectedPair?.fromId === from.id &&
                          selectedPair?.toId === to.id;
                        if (amt <= 0) {
                          return (
                            <td
                              key={to.id}
                              className="px-2 py-1 text-right text-muted-foreground/40"
                            >
                              —
                            </td>
                          );
                        }
                        return (
                          <td key={to.id} className="px-1 py-0.5 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              className={cn(
                                "h-auto w-full rounded px-1 py-1 text-right tabular-nums font-medium",
                                isSelected
                                  ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300 hover:bg-amber-100"
                                  : "text-amber-900 hover:bg-amber-50"
                              )}
                              onClick={() => togglePair(from.id, to.id)}
                              aria-pressed={isSelected}
                            >
                              {formatMoney(amt, baseCurrency)}
                            </Button>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-right font-semibold tabular-nums">
                        {(debtGrid.rowTotals[from.id] || 0) > 0
                          ? formatMoney(
                              debtGrid.rowTotals[from.id] || 0,
                              baseCurrency
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/60 bg-muted/30">
                    <td className="px-2 py-1.5 font-semibold">Σ</td>
                    {members.map((m) => (
                      <td
                        key={m.id}
                        className="px-2 py-1.5 text-right font-semibold tabular-nums"
                      >
                        {(debtGrid.colTotals[m.id] || 0) > 0
                          ? formatMoney(
                              debtGrid.colTotals[m.id] || 0,
                              baseCurrency
                            )
                          : "—"}
                      </td>
                    ))}
                    <td className="px-2 py-1.5" />
                  </tr>
                </tfoot>
              </table>
            </div>

            {pairExplain ? (
              <PairDebtBreakdown
                explain={pairExplain}
                baseCurrency={baseCurrency}
                onClose={() => setSelectedPair(null)}
              />
            ) : null}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

function PairDebtBreakdown({
  explain,
  baseCurrency,
  onClose,
}: {
  explain: PairDebtExplanation;
  baseCurrency: string;
  onClose: () => void;
}) {
  const kinds: PairDebtLineKind[] = [
    "owe_from_booking",
    "credit_from_booking",
    "settlement_paid",
    "settlement_received",
  ];

  return (
    <div className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/40 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">
            {explain.fromName} → {explain.toName}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">
            Netto{" "}
            <span className="font-semibold tabular-nums text-amber-950">
              {formatMoney(Math.max(0, explain.netAmount), baseCurrency)}
            </span>
          </p>
        </div>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-[0.6875rem] text-muted-foreground"
          onClick={onClose}
        >
          Schliessen
        </Button>
      </div>

      <div className="space-y-3">
        {kinds.map((kind) => {
          const sectionLines = explain.lines.filter((l) => l.kind === kind);
          if (sectionLines.length === 0) return null;
          const meta = LINE_SECTION[kind];
          const sectionSum = sectionLines.reduce(
            (s, l) => s + l.signedAmount,
            0
          );
          return (
            <div key={kind}>
              <p className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {meta.title(explain.fromName, explain.toName)}
              </p>
              <ul className="space-y-0.5">
                {sectionLines.map((line, i) => (
                  <li
                    key={`${kind}-${line.expenseId ?? line.settlementId ?? i}`}
                    className="flex items-baseline justify-between gap-3 text-[0.6875rem]"
                  >
                    <span className="min-w-0 truncate text-foreground">
                      {line.label}
                      {line.preSettled ? (
                        <span className="ml-1 text-muted-foreground">
                          · ausgeglichen
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums font-medium",
                        meta.tone
                      )}
                    >
                      {formatSignedMoney(line.signedAmount, baseCurrency)}
                    </span>
                  </li>
                ))}
              </ul>
              <p
                className={cn(
                  "mt-0.5 text-right text-[0.6875rem] font-semibold tabular-nums",
                  meta.tone
                )}
              >
                Σ {formatSignedMoney(sectionSum, baseCurrency)}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 border-t border-amber-200/70 pt-2 text-[0.6875rem] leading-snug text-muted-foreground">
        Rechnung: Anteile an {explain.toName}s Ausgaben (
        {formatMoney(explain.oweTotal, baseCurrency)}) − Anteile von{" "}
        {explain.toName} an {explain.fromName}s Ausgaben (
        {formatMoney(explain.creditTotal, baseCurrency)}) − Rückzahlungen{" "}
        {explain.fromName}→{explain.toName} (
        {formatMoney(explain.settlementPaidTotal, baseCurrency)}) + Rückzahlungen{" "}
        {explain.toName}→{explain.fromName} (
        {formatMoney(explain.settlementReceivedTotal, baseCurrency)}) ={" "}
        <span className="font-semibold text-foreground">
          {formatMoney(Math.max(0, explain.netAmount), baseCurrency)}
        </span>
      </p>
    </div>
  );
}
