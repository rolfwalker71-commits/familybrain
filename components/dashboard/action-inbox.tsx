"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  FileWarning,
  Inbox,
  Receipt,
  Shield,
  Undo2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DocumentAiIcon } from "@/components/documents/document-ai-icon";
import { formatCHF } from "@/lib/utils/format";
import {
  dueUrgency,
  dueUrgencyTextClass,
  formatDueRelative,
} from "@/lib/utils/due-urgency";
import { cn } from "@/lib/utils";
import type { TriageAction } from "@/lib/documents/triage-shared";
import {
  INBOX_SOURCE_LABELS,
  type InboxSourceKind,
  type InboxTask,
  type InboxTaskAction,
  type InboxTaskBoard,
  type InboxTriagePayload,
} from "@/lib/inbox/types";
import { toSwissDate } from "@/lib/utils/dates";

type BoardTab = "open" | "snoozed" | "completed";

const TRIAGE_LABELS: Record<string, string> = {
  invoice: "Rechnung",
  high_amount: "Hoher Betrag",
  warranty: "Garantie",
  deadline: "Frist",
  travel: "Reise",
};

function sourceIcon(kind: InboxSourceKind) {
  switch (kind) {
    case "deadline":
      return CalendarClock;
    case "invoice":
      return Receipt;
    case "warranty":
      return Shield;
    case "analysis":
      return FileWarning;
    default:
      return Inbox;
  }
}

export function ActionInbox() {
  const [board, setBoard] = useState<InboxTaskBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [tab, setTab] = useState<BoardTab>("open");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/inbox");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setBoard(json as InboxTaskBoard);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const onInbox = () => {
      void load();
    };
    window.addEventListener("buddy:inbox", onInbox);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 45000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("buddy:inbox", onInbox);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  async function runTaskAction(
    task: InboxTask,
    action: InboxTaskAction,
    snoozeDays?: number
  ) {
    setBusyKey(`${task.id}:${action}`);
    setActionError(null);
    try {
      const res = await fetch("/api/dashboard/inbox/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceKind: task.sourceKind,
          sourceId: task.sourceId,
          action,
          snoozeDays,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || "Aktion fehlgeschlagen"
        );
      }
      if ((json as { board?: InboxTaskBoard }).board) {
        setBoard((json as { board: InboxTaskBoard }).board);
      } else {
        await load();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  async function resolveTriage(input: {
    documentLocalId: number;
    action: TriageAction;
    taxRelevant: boolean;
    taxYear: number | null;
    snoozeDays?: number;
  }) {
    setBusyKey(`triage:${input.documentLocalId}`);
    setActionError(null);
    try {
      const res = await fetch("/api/dashboard/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || "Aktion fehlgeschlagen"
        );
      }
      const sync = await fetch("/api/dashboard/inbox/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceKind: "triage",
          sourceId: String(input.documentLocalId),
          action: input.action === "snooze" ? "snooze" : "done",
          snoozeDays: input.snoozeDays ?? 7,
        }),
      });
      const syncJson = await sync.json().catch(() => ({}));
      if (sync.ok && (syncJson as { board?: InboxTaskBoard }).board) {
        setBoard((syncJson as { board: InboxTaskBoard }).board);
      } else {
        await load();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  if (error) {
    return (
      <Card className="border-border/70">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Action-Inbox konnte nicht geladen werden.
        </CardContent>
      </Card>
    );
  }

  if (!board) {
    return (
      <Card className="border-border/70">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Lade Aufgaben…
        </CardContent>
      </Card>
    );
  }

  const list =
    tab === "open"
      ? board.open
      : tab === "snoozed"
        ? board.snoozed
        : board.completed;

  return (
    <Card className="border-border/70 shadow-[0_2px_4px_rgba(20,32,28,0.06),0_10px_28px_rgba(20,32,28,0.08)]">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Was muss ich tun?
            </p>
            <h2 className="mt-0.5 text-base font-bold tracking-tight sm:text-lg">
              Action-Inbox
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Einheitliche Aufgaben aus Prüfung, Fristen, Rechnungen, Garantien
              und Analysen.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["open", "Offen", board.counts.open],
                ["snoozed", "Später", board.counts.snoozed],
                ["completed", "Erledigt", board.counts.completed],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  tab === key
                    ? "border-transparent bg-[var(--brand-docs)] text-white"
                    : "border-border/70 bg-background text-muted-foreground hover:bg-muted/50"
                )}
              >
                {label}
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-5 min-w-5 justify-center px-1 text-[10px]",
                    tab === key && "bg-white/20 text-white"
                  )}
                >
                  {count}
                </Badge>
              </button>
            ))}
          </div>
        </div>

        {actionError ? (
          <p className="text-sm text-destructive">{actionError}</p>
        ) : null}

        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tab === "open"
              ? "Aktuell nichts Dringendes."
              : tab === "snoozed"
                ? "Keine pausierten Aufgaben."
                : "Noch keine erledigten Aufgaben in der Historie."}
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                tab={tab}
                busyKey={busyKey}
                onAction={(action, snoozeDays) =>
                  void runTaskAction(task, action, snoozeDays)
                }
                onTriage={(payload) => void resolveTriage(payload)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TaskRow({
  task,
  tab,
  busyKey,
  onAction,
  onTriage,
}: {
  task: InboxTask;
  tab: BoardTab;
  busyKey: string | null;
  onAction: (action: InboxTaskAction, snoozeDays?: number) => void;
  onTriage: (payload: {
    documentLocalId: number;
    action: TriageAction;
    taxRelevant: boolean;
    taxYear: number | null;
    snoozeDays?: number;
  }) => void;
}) {
  const Icon = sourceIcon(task.sourceKind);
  const busy = busyKey?.startsWith(task.id) || busyKey === `triage:${task.sourceId}`;

  if (task.sourceKind === "triage" && task.triage && tab === "open") {
    return (
      <TriagePendingCard
        row={task.triage}
        busy={Boolean(busy)}
        onSubmit={onTriage}
      />
    );
  }

  return (
    <li className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {INBOX_SOURCE_LABELS[task.sourceKind]}
            </Badge>
            {task.status === "snoozed" && task.snoozedUntil ? (
              <Badge variant="outline" className="text-[10px]">
                bis {toSwissDate(task.snoozedUntil)}
              </Badge>
            ) : null}
            {task.status === "done" || task.status === "dismissed" ? (
              <Badge variant="outline" className="text-[10px]">
                {task.status === "dismissed" ? "Ausgeblendet" : "Erledigt"}
              </Badge>
            ) : null}
          </div>
          <Link
            href={task.href}
            className="mt-1 flex items-start gap-2.5 hover:opacity-90"
          >
            {task.aiIconUrl || task.category ? (
              <DocumentAiIcon
                aiIconUrl={task.aiIconUrl}
                category={task.category}
                size="xs"
              />
            ) : null}
            <span className="min-w-0">
              <span className="block font-medium text-foreground">
                {task.title}
              </span>
              {task.subtitle ? (
                <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                  {task.subtitle}
                </span>
              ) : null}
              <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                {task.dueDate ? (
                  <span className={dueUrgencyTextClass(dueUrgency(task.dueDate))}>
                    {formatDueRelative(task.dueDate)}
                  </span>
                ) : null}
                {task.amount != null ? (
                  <span className="tabular-nums font-semibold text-foreground">
                    {formatCHF(task.amount, task.currency || "CHF")}
                  </span>
                ) : null}
                {task.analysisCount != null ? (
                  <span>{task.analysisCount} Dokumente</span>
                ) : null}
                {task.completedAt ? (
                  <span>
                    {toSwissDate(task.completedAt.slice(0, 10))}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
        {tab === "completed" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() => onAction("reopen")}
          >
            <Undo2 className="size-3.5" />
            Wieder öffnen
          </Button>
        ) : (
          <>
            {task.sourceKind === "invoice" ? (
              <Button
                type="button"
                size="sm"
                disabled={Boolean(busy)}
                className="bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
                onClick={() => onAction("mark_paid")}
              >
                <CheckCircle2 className="size-3.5" />
                Beglichen
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => onAction("snooze", 7)}
            >
              <Clock3 className="size-3.5" />
              +7 Tage
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => onAction("done")}
            >
              <Check className="size-3.5" />
              Erledigt
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() => onAction("dismiss")}
            >
              <X className="size-3.5" />
              Ausblenden
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function ChoiceChip({
  active,
  disabled,
  onClick,
  children,
  accent,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      disabled={disabled}
      className={cn(
        active && accent
          ? "bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
          : undefined
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function TriagePendingCard({
  row,
  busy,
  onSubmit,
}: {
  row: InboxTriagePayload;
  busy: boolean;
  onSubmit: (payload: {
    documentLocalId: number;
    action: TriageAction;
    taxRelevant: boolean;
    taxYear: number | null;
    snoozeDays?: number;
  }) => void;
}) {
  const needsPay =
    row.reasons.includes("invoice") || row.reasons.includes("high_amount");
  const [action, setAction] = useState<TriageAction | null>(null);
  const [taxRelevant, setTaxRelevant] = useState<boolean | null>(
    row.tax_suggested ? true : null
  );
  const [taxYearInput, setTaxYearInput] = useState(
    row.tax_year != null ? String(row.tax_year) : ""
  );

  const taxYearNum = (() => {
    const n = Number(taxYearInput);
    return Number.isInteger(n) && n >= 1990 && n <= 2100 ? n : null;
  })();

  const canSubmit =
    action != null &&
    taxRelevant != null &&
    (taxRelevant === false || taxYearNum != null);

  return (
    <li className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <Link
          href={`/documents/${row.id}`}
          className="flex min-w-0 flex-1 items-start gap-2.5 hover:opacity-90"
        >
          <DocumentAiIcon
            aiIconUrl={row.ai_icon_url}
            category={row.category}
            size="xs"
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                Prüfung
              </Badge>
            </span>
            <span className="mt-1 block font-medium">
              {row.vendor ||
                row.correspondent_name ||
                row.title ||
                "Dokument"}
            </span>
            <span className="mt-1 flex flex-wrap gap-1">
              {row.reasons.map((reason) => (
                <Badge key={reason} variant="secondary" className="text-[10px]">
                  {TRIAGE_LABELS[reason] || reason}
                </Badge>
              ))}
              {row.tax_suggested ? (
                <Badge variant="secondary" className="text-[10px]">
                  Steuern
                  {row.tax_year != null ? ` ${row.tax_year}` : ""}
                </Badge>
              ) : null}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {[
                row.amount != null
                  ? formatCHF(row.amount, row.currency || "CHF")
                  : null,
                row.due_date ? formatDueRelative(row.due_date) : null,
                row.short_summary,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </Link>
      </div>

      <div className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </p>
          <div className="flex flex-wrap gap-2">
            {needsPay ? (
              <ChoiceChip
                active={action === "pay"}
                accent
                disabled={busy}
                onClick={() => setAction("pay")}
              >
                Muss bezahlt werden
              </ChoiceChip>
            ) : (
              <ChoiceChip
                active={action === "done"}
                disabled={busy}
                onClick={() => setAction("done")}
              >
                Erledigt
              </ChoiceChip>
            )}
            <ChoiceChip
              active={action === "ebill"}
              disabled={busy}
              onClick={() => setAction("ebill")}
            >
              eBill
            </ChoiceChip>
            <ChoiceChip
              active={action === "twint"}
              disabled={busy}
              onClick={() => setAction("twint")}
            >
              Twint
            </ChoiceChip>
            <ChoiceChip
              active={action === "card"}
              disabled={busy}
              onClick={() => setAction("card")}
            >
              Kreditkarte
            </ChoiceChip>
            <ChoiceChip
              active={action === "ignore"}
              disabled={busy}
              onClick={() => setAction("ignore")}
            >
              <X className="size-3.5" />
              Irrelevant
            </ChoiceChip>
            <ChoiceChip
              active={action === "snooze"}
              disabled={busy}
              onClick={() => setAction("snooze")}
            >
              Später (+7)
            </ChoiceChip>
          </div>
        </div>

        {action === "snooze" ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                onSubmit({
                  documentLocalId: row.id,
                  action: "snooze",
                  taxRelevant: false,
                  taxYear: null,
                  snoozeDays: 7,
                })
              }
            >
              <Check className="size-3.5" />
              {busy ? "…" : "7 Tage pausieren"}
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Steuerrelevant
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ChoiceChip
                  active={taxRelevant === true}
                  disabled={busy}
                  onClick={() => setTaxRelevant(true)}
                >
                  Ja
                </ChoiceChip>
                <ChoiceChip
                  active={taxRelevant === false}
                  disabled={busy}
                  onClick={() => setTaxRelevant(false)}
                >
                  Nein
                </ChoiceChip>
                {taxRelevant === true ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Steuerjahr
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1990}
                      max={2100}
                      placeholder="2025"
                      className="h-8 w-24"
                      value={taxYearInput}
                      disabled={busy}
                      onChange={(e) => setTaxYearInput(e.target.value)}
                    />
                  </label>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={busy || !canSubmit}
                onClick={() => {
                  if (!action || taxRelevant == null) return;
                  if (taxRelevant && taxYearNum == null) return;
                  onSubmit({
                    documentLocalId: row.id,
                    action,
                    taxRelevant,
                    taxYear: taxRelevant ? taxYearNum : null,
                  });
                }}
              >
                <Check className="size-3.5" />
                {busy ? "…" : "OK"}
              </Button>
            </div>
          </>
        )}
      </div>
    </li>
  );
}
