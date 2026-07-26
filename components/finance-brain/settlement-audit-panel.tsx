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
  type ShareMatrixExpense,
  type ShareMatrixMember,
} from "@/lib/finance-brain/settlement-audit";
import { cn } from "@/lib/utils";

type Debt = {
  fromMemberId: number;
  toMemberId: number;
  amount: number;
};

export function SettlementAuditPanel({
  expenses,
  members,
  debts,
  baseCurrency,
  balanceNetByMemberId,
}: {
  expenses: ShareMatrixExpense[];
  members: ShareMatrixMember[];
  debts: Debt[];
  baseCurrency: string;
  /** Optional: actual saldo nets (incl. settlements) for comparison. */
  balanceNetByMemberId?: Record<number, number>;
}) {
  const [open, setOpen] = useState(false);

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

  if (members.length === 0 || matrix.rows.length === 0) {
    return null;
  }

  return (
    <Card
      size="sm"
      tone="green"
      className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
    >
      <CardHeader tone="green" className="py-1.5">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <CardTitle className="flex items-center gap-2 text-[15px]! text-[var(--brand-finance)]">
            <IconCircle icon={Table2} tone="green" size="sm" />
            Prüfen: Anteile
          </CardTitle>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-[var(--brand-finance)] transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-4">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Jede Zeile ist eine Buchung, jede Spalte ein Teilnehmer. Zellen =
            Anteil. Summe bezahlt / Anteil / Netto unten sollten zu «Saldo pro
            Person» passen (Netto hier ohne Rückzahlungen).
          </p>

          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full min-w-[36rem] border-collapse text-left text-[11px] leading-snug">
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
                      {row.preSettled ? (
                        <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                          · ausgeglichen
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
                  <td className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">
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
            <p className="mb-1.5 text-[11px] font-semibold text-foreground">
              Wer → wem (Nach Zahler)
            </p>
            <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
              Zeile schuldet Spalte. Entspricht der Liste «Nach Zahler».
            </p>
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full min-w-[20rem] border-collapse text-left text-[11px]">
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
                        return (
                          <td
                            key={to.id}
                            className={cn(
                              "px-2 py-1 text-right tabular-nums",
                              amt > 0
                                ? "font-medium text-amber-900"
                                : "text-muted-foreground/40"
                            )}
                          >
                            {amt > 0 ? formatMoney(amt, baseCurrency) : "—"}
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
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
