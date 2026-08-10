"use client";

import type { MariTimeLine } from "@/lib/mari/timekeeping";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

function formatHours(n: number): string {
  return n.toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function MaringoTimeLinesTable({
  lines,
  totalHours,
  billableHours,
  nonBillableHours,
  emptyText = "Keine Buchungen.",
  className,
}: {
  lines: MariTimeLine[];
  totalHours?: number;
  billableHours?: number;
  nonBillableHours?: number;
  emptyText?: string;
  className?: string;
}) {
  const total =
    totalHours ??
    Math.round(lines.reduce((s, l) => s + l.hours, 0) * 100) / 100;
  const billable =
    billableHours ??
    Math.round(lines.reduce((s, l) => s + l.hoursBillable, 0) * 100) / 100;
  const nonBillable =
    nonBillableHours ?? Math.round((total - billable) * 100) / 100;

  if (lines.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full min-w-[40rem] text-left text-[12px]">
          <thead className="bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2.5 py-2">Datum</th>
              <th className="px-2.5 py-2">Projekt</th>
              <th className="px-2.5 py-2">Aktivität / Memo</th>
              <th className="px-2.5 py-2">Bearbeiter</th>
              <th className="px-2.5 py-2 text-right">Std.</th>
              <th className="px-2.5 py-2 text-right">Verr.</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr
                key={l.lineId}
                className="border-t border-border/50 align-top"
              >
                <td className="whitespace-nowrap px-2.5 py-2 tabular-nums">
                  {toSwissDate(l.serviceDate)}
                </td>
                <td className="px-2.5 py-2 font-medium">{l.projectNumber}</td>
                <td className="px-2.5 py-2">
                  <p className="font-medium">{l.activity || "–"}</p>
                  {l.memo ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                      {l.memo}
                    </p>
                  ) : null}
                </td>
                <td className="px-2.5 py-2">
                  {l.employeeName || l.employeeNumber || "–"}
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums">
                  {formatHours(l.hours)}
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums">
                  {formatHours(l.hoursBillable)}
                  {l.billable ? (
                    <span className="ml-1 text-[10px] text-emerald-700">
                      ja
                    </span>
                  ) : (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      nein
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Summe{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {formatHours(total)} h
        </span>
        {" · "}
        verrechenbar{" "}
        <span className="font-semibold text-emerald-800 tabular-nums">
          {formatHours(billable)} h
        </span>
        {" · "}
        nicht verrechenbar{" "}
        <span className="font-semibold tabular-nums">
          {formatHours(nonBillable)} h
        </span>
      </p>
    </div>
  );
}
