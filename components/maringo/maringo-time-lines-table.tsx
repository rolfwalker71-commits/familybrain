"use client";

import { useState } from "react";
import { ChevronRight, Copy, Pencil, Trash2 } from "lucide-react";
import {
  approvalStatusLabel,
  type MariApprovalStatus,
  type MariTimeLine,
} from "@/lib/mari/timekeeping-shared";
import { labelForInternalRemarkVerr } from "@/lib/mari/timekeeping-udfs";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { toSwissDate, toSwissWeekday } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MariHoursSplitSummary } from "@/components/maringo/mari-hours-split-summary";

function ServiceDateLabel({
  serviceDate,
  className,
}: {
  serviceDate: string;
  className?: string;
}) {
  const weekday = toSwissWeekday(serviceDate);
  return (
    <span className={cn("inline-flex flex-col leading-tight", className)}>
      <span className="tabular-nums">{toSwissDate(serviceDate)}</span>
      {weekday ? (
        <span className="text-[10px] font-normal text-muted-foreground">
          {weekday}
        </span>
      ) : null}
    </span>
  );
}

function ProjectWithCustomer({
  projectNumber,
  projectCustomer,
}: {
  projectNumber: string;
  projectCustomer: string | null;
}) {
  const pn = projectNumber.trim();
  const customer = (projectCustomer || "").trim();
  if (!pn && !customer) return <span>–</span>;
  if (!customer) {
    return <span className="font-semibold tabular-nums text-foreground">{pn}</span>;
  }
  if (
    !pn ||
    customer === pn ||
    customer.includes(`(${pn})`) ||
    customer.endsWith(` ${pn}`)
  ) {
    return (
      <span className="min-w-0 truncate font-bold text-foreground">{customer}</span>
    );
  }
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0">
      <span className="min-w-0 truncate font-bold text-foreground">{customer}</span>
      <span className="font-medium tabular-nums text-muted-foreground">({pn})</span>
    </span>
  );
}

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
      <Button
        type="button"
        variant="link"
        size="sm"
        className="inline-flex h-auto items-center gap-0.5 p-0 text-[10px] font-medium text-orange-800 underline-offset-2"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform",
            open && "rotate-90"
          )}
          aria-hidden
        />
        {open ? "Memo zuklappen" : "Memo aufklappen"}
      </Button>
      {open ? (
        <p className="mt-0.5 whitespace-pre-wrap text-[10px] text-muted-foreground">
          {memo}
        </p>
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
        "inline-flex whitespace-nowrap rounded px-1 py-px text-[9px] font-semibold",
        s === "approved" &&
          "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100",
        s === "recorded" &&
          "bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100",
        s === "draft" &&
          "bg-sky-100 text-sky-950 dark:bg-sky-500/20 dark:text-sky-100",
        s === "rejected" &&
          "bg-rose-100 text-rose-950 dark:bg-rose-500/20 dark:text-rose-100",
        s === "unknown" && "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}

function LineActions({
  line,
  busy,
  locked,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  line: MariTimeLine;
  busy: boolean;
  locked: boolean;
  onEdit?: (line: MariTimeLine) => void;
  onDuplicate?: (line: MariTimeLine) => void;
  onDelete?: (line: MariTimeLine) => void | Promise<void>;
}) {
  if (!onEdit && !onDuplicate && !onDelete) return null;
  return (
    <div className="flex shrink-0 gap-0">
      {onEdit ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6"
          disabled={busy || locked || line.lineId <= 0}
          onClick={() => onEdit(line)}
          aria-label={
            locked ? "Freigegeben — nicht änderbar" : "Buchung ändern"
          }
          title={locked ? "Freigegeben — nicht änderbar" : "Ändern"}
        >
          <Pencil className="size-3" strokeWidth={APP_ICON_STROKE} />
        </Button>
      ) : null}
      {onDuplicate ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6"
          disabled={busy || line.lineId <= 0}
          onClick={() => onDuplicate(line)}
          aria-label="Buchung duplizieren"
          title="Duplizieren"
        >
          <Copy className="size-3" strokeWidth={APP_ICON_STROKE} />
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6 text-rose-700 hover:text-rose-800"
          disabled={busy || locked || line.lineId <= 0}
          onClick={() => void onDelete(line)}
          aria-label={
            locked ? "Freigegeben — nicht löschbar" : "Buchung löschen"
          }
          title={locked ? "Freigegeben — nicht löschbar" : "Löschen"}
        >
          <Trash2 className="size-3" strokeWidth={APP_ICON_STROKE} />
        </Button>
      ) : null}
    </div>
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
  onDuplicate,
  onDelete,
  busyLineId,
  /** stack = mehrzeilige Karten ohne Horizontal-Scroll (Flyout). */
  variant = "stack",
  /** chart = Donut + KPIs; text = Summenzeile; none = kein Footer (KPIs sitzen im Header). */
  summaryVariant = "text",
}: {
  lines: MariTimeLine[];
  totalHours?: number;
  billableHours?: number;
  nonBillableHours?: number;
  emptyText?: string;
  className?: string;
  onEdit?: (line: MariTimeLine) => void;
  onDuplicate?: (line: MariTimeLine) => void;
  onDelete?: (line: MariTimeLine) => void | Promise<void>;
  busyLineId?: number | null;
  variant?: "stack" | "table";
  summaryVariant?: "text" | "chart" | "none";
}) {
  const total =
    totalHours ??
    Math.round(lines.reduce((s, l) => s + l.hours, 0) * 100) / 100;
  const billable =
    billableHours ??
    Math.round(lines.reduce((s, l) => s + l.hoursBillable, 0) * 100) / 100;
  const nonBillable =
    nonBillableHours ?? Math.round((total - billable) * 100) / 100;

  const showActions = Boolean(onEdit || onDuplicate || onDelete);

  if (lines.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/60 px-2.5 py-4 text-center text-[12px] text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  const totals =
    summaryVariant === "chart" ? (
      <MariHoursSplitSummary
        totalHours={total}
        billableHours={billable}
        nonBillableHours={nonBillable}
        lineCount={lines.length}
        totalHint="Ticket"
      />
    ) : summaryVariant === "text" ? (
      <p className="text-[11px] text-muted-foreground">
        Summe{" "}
        <span className="font-semibold tabular-nums text-foreground">
          {formatHours(total)} h
        </span>
        {" · "}
        verrechenbar{" "}
        <span className="font-semibold tabular-nums text-emerald-800">
          {formatHours(billable)} h
        </span>
        {" · "}
        nicht verrechenbar{" "}
        <span className="font-semibold tabular-nums">
          {formatHours(nonBillable)} h
        </span>
      </p>
    ) : null;

  if (variant === "stack") {
    return (
      <div className={cn("space-y-1.5", className)}>
        {summaryVariant === "chart" ? totals : null}
        <ul className="space-y-1.5">
          {lines.map((l) => {
            const busy = busyLineId === l.lineId;
            const locked = Boolean(l.approved);
            return (
              <li
                key={l.lineId}
                className="rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-[11px]"
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <span className="font-semibold">
                        <ServiceDateLabel serviceDate={l.serviceDate} />
                      </span>
                      <ProjectWithCustomer
                        projectNumber={l.projectNumber}
                        projectCustomer={l.projectCustomer}
                      />
                      <span className="ml-auto font-semibold tabular-nums text-foreground">
                        {formatHours(l.hours)} h
                      </span>
                    </div>
                    <p className="wrap-break-word font-medium leading-snug">
                      {l.activity || "–"}
                    </p>
                    {l.memo ? <MemoBlock memo={l.memo} /> : null}
                    {l.internalRemarkVerr || l.zeroHoursReason ? (
                      <div className="space-y-0.5 text-[10px] text-muted-foreground">
                        {l.internalRemarkVerr ? (
                          <p>
                            Verr.:{" "}
                            <span className="font-medium text-foreground/80">
                              {labelForInternalRemarkVerr(l.internalRemarkVerr)}
                            </span>
                          </p>
                        ) : null}
                        {l.zeroHoursReason ? (
                          <p className="wrap-break-word">
                            Nullerstunden:{" "}
                            <span className="font-medium text-foreground/80">
                              {l.zeroHoursReason}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span>
                        {l.employeeName || l.employeeNumber || "–"}
                      </span>
                      <ApprovalBadge
                        status={l.approvalStatus}
                        approved={l.approved}
                      />
                      <span className="tabular-nums">
                        verr. {formatHours(l.hoursBillable)} h
                        {l.billable ? "" : " · nicht verr."}
                      </span>
                    </div>
                  </div>
                  {showActions ? (
                    <LineActions
                      line={l}
                      busy={busy}
                      locked={locked}
                      onEdit={onEdit}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {summaryVariant === "text" ? totals : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full min-w-[44rem] text-left text-[11px]">
          <thead className="bg-muted/40 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5">Datum</th>
              <th className="px-2 py-1.5">Projekt</th>
              <th className="px-2 py-1.5">Aktivität / Memo</th>
              <th className="px-2 py-1.5">Bearbeiter</th>
              <th className="px-2 py-1.5">Freigabe</th>
              <th className="px-2 py-1.5 text-right">Std.</th>
              <th className="px-2 py-1.5 text-right">Verr.</th>
              {showActions ? (
                <th className="px-2 py-1.5 text-right">Aktion</th>
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
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <ServiceDateLabel
                      serviceDate={l.serviceDate}
                      className="font-medium"
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <ProjectWithCustomer
                      projectNumber={l.projectNumber}
                      projectCustomer={l.projectCustomer}
                    />
                  </td>
                  <td className="max-w-[20rem] px-2 py-1.5">
                    <p className="font-medium leading-snug">{l.activity || "–"}</p>
                    {l.memo ? <MemoBlock memo={l.memo} /> : null}
                  </td>
                  <td className="px-2 py-1.5">
                    {l.employeeName || l.employeeNumber || "–"}
                  </td>
                  <td className="px-2 py-1.5">
                    <ApprovalBadge
                      status={l.approvalStatus}
                      approved={l.approved}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatHours(l.hours)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatHours(l.hoursBillable)}
                    {l.billable ? (
                      <span className="ml-1 text-[9px] text-emerald-700">
                        ja
                      </span>
                    ) : (
                      <span className="ml-1 text-[9px] text-muted-foreground">
                        nein
                      </span>
                    )}
                  </td>
                  {showActions ? (
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end">
                        <LineActions
                          line={l}
                          busy={busy}
                          locked={locked}
                          onEdit={onEdit}
                          onDuplicate={onDuplicate}
                          onDelete={onDelete}
                        />
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totals}
    </div>
  );
}
