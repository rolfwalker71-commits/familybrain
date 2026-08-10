"use client";

import { useState } from "react";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";
import {
  approvalStatusLabel,
  type MariApprovalStatus,
  type MariTimeLine,
} from "@/lib/mari/timekeeping-shared";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function formatHours(n: number): string {
  return n.toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MemoBlock({ memo }: { memo: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-0.5">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-800 underline-offset-2 hover:underline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-90"
          )}
          aria-hidden
        />
        {open ? "Memo zuklappen" : "Memo aufklappen"}
      </button>
      {open ? (
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{memo}</p>
      ) : null}
    </div>
  );
}

function ApprovalBadge({
  status,
  approved,
}: {
  status?: MariApprovalStatus;
  approved?: boolean;
}) {
  const s = status || (approved ? "approved" : "recorded");
  const label = approvalStatusLabel(s);
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold",
        s === "approved" && "bg-emerald-100 text-emerald-900",
        s === "recorded" && "bg-amber-100 text-amber-950",
        s === "draft" && "bg-sky-100 text-sky-950",
        s === "rejected" && "bg-rose-100 text-rose-950",
        s === "unknown" && "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}

export function MaringoTimeLinesTable({
  lines,
  totalHours,
  billableHours,
  nonBillableHours,
  emptyText = "Keine Buchungen.",
  className,
  onEdit,
  onDelete,
  busyLineId,
}: {
  lines: MariTimeLine[];
  totalHours?: number;
  billableHours?: number;
  nonBillableHours?: number;
  emptyText?: string;
  className?: string;
  onEdit?: (line: MariTimeLine) => void;
  onDelete?: (line: MariTimeLine) => void | Promise<void>;
  busyLineId?: number | null;
}) {
  const total =
    totalHours ??
    Math.round(lines.reduce((s, l) => s + l.hours, 0) * 100) / 100;
  const billable =
    billableHours ??
    Math.round(lines.reduce((s, l) => s + l.hoursBillable, 0) * 100) / 100;
  const nonBillable =
    nonBillableHours ?? Math.round((total - billable) * 100) / 100;

  const showActions = Boolean(onEdit || onDelete);

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
        <table className="w-full min-w-[44rem] text-left text-[12px]">
          <thead className="bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2.5 py-2">Datum</th>
              <th className="px-2.5 py-2">Projekt</th>
              <th className="px-2.5 py-2">Aktivität / Memo</th>
              <th className="px-2.5 py-2">Bearbeiter</th>
              <th className="px-2.5 py-2">Freigabe</th>
              <th className="px-2.5 py-2 text-right">Std.</th>
              <th className="px-2.5 py-2 text-right">Verr.</th>
              {showActions ? (
                <th className="px-2.5 py-2 text-right">Aktion</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const busy = busyLineId === l.lineId;
              const locked = Boolean(l.approved);
              return (
                <tr
                  key={l.lineId}
                  className="border-t border-border/50 align-top"
                >
                  <td className="whitespace-nowrap px-2.5 py-2 tabular-nums">
                    {toSwissDate(l.serviceDate)}
                  </td>
                  <td className="px-2.5 py-2 font-medium">{l.projectNumber}</td>
                  <td className="max-w-[20rem] px-2.5 py-2">
                    <p className="font-medium">{l.activity || "–"}</p>
                    {l.memo ? <MemoBlock memo={l.memo} /> : null}
                  </td>
                  <td className="px-2.5 py-2">
                    {l.employeeName || l.employeeNumber || "–"}
                  </td>
                  <td className="px-2.5 py-2">
                    <ApprovalBadge
                      status={l.approvalStatus}
                      approved={l.approved}
                    />
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
                  {showActions ? (
                    <td className="px-2.5 py-2">
                      <div className="flex justify-end gap-0.5">
                        {onEdit ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            disabled={busy || locked || l.lineId <= 0}
                            onClick={() => onEdit(l)}
                            aria-label={
                              locked
                                ? "Freigegeben — nicht änderbar"
                                : "Buchung ändern"
                            }
                            title={
                              locked
                                ? "Freigegeben — nicht änderbar"
                                : "Ändern"
                            }
                          >
                            <Pencil
                              className="size-3.5"
                              strokeWidth={APP_ICON_STROKE}
                            />
                          </Button>
                        ) : null}
                        {onDelete ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7 text-rose-700 hover:text-rose-800"
                            disabled={busy || locked || l.lineId <= 0}
                            onClick={() => void onDelete(l)}
                            aria-label={
                              locked
                                ? "Freigegeben — nicht löschbar"
                                : "Buchung löschen"
                            }
                            title={
                              locked
                                ? "Freigegeben — nicht löschbar"
                                : "Löschen"
                            }
                          >
                            <Trash2
                              className="size-3.5"
                              strokeWidth={APP_ICON_STROKE}
                            />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
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
