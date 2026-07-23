"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Download,
  Mail,
  MapPin,
  Maximize2,
  Pencil,
  RefreshCw,
  Scale,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatDateDe,
  formatExchangeRateLine,
  formatMoney,
  formatMoneyFxSummary,
  formatSignedMoney,
} from "@/lib/finance-brain/format";
import { COMMON_CURRENCIES } from "@/lib/finance-brain/constants";
import {
  expenseVisualForExpense,
  settlementVisual,
} from "@/lib/finance-brain/expense-category";
import { ExpenseReceiptControls } from "@/components/finance-brain/expense-receipt-controls";
import {
  IconCircle,
  toneSurface,
  type IconTone,
} from "@/components/layout/icon-circle";
import {
  CalendarDateBadge,
  toIsoDateOnly,
} from "@/components/layout/calendar-date-badge";
import { cn } from "@/lib/utils";

type Balance = {
  memberId: number;
  displayName: string;
  paidBase: number;
  owedBase: number;
  settlementsReceivedBase: number;
  settlementsPaidBase: number;
  netBalance: number;
};

type Debt = {
  fromMemberId: number;
  fromDisplayName: string;
  toMemberId: number;
  toDisplayName: string;
  amount: number;
};

export type ExpenseListItem = {
  id: number;
  description: string | null;
  amount: number;
  currency: string;
  exchange_rate?: number;
  amount_base: number;
  expense_date: string | null;
  paid_by_member_id: number;
  direction?: "expense" | "income";
  category_label?: string | null;
  category_tone?: string | null;
  place_name?: string | null;
  place_lat?: number | null;
  place_lon?: number | null;
  note?: string | null;
  receipt_url?: string | null;
  has_receipt?: boolean;
  ai_image_url?: string | null;
  has_ai_image?: boolean;
  splits: Array<{ member_id: number; share_amount_base: number }>;
};

export type ExpenseEditPayload = {
  description: string | null;
  expenseDate: string | null;
  paidByMemberId: number;
  place: string | null;
  note: string | null;
  amount: number;
  currency: string;
  exchangeRate: number;
  direction?: "expense" | "income";
};

export function BalanceView({
  balances,
  simplifiedDebts,
  baseCurrency,
  highlightMemberId,
}: {
  balances: Balance[];
  simplifiedDebts: Debt[];
  baseCurrency: string;
  highlightMemberId?: number;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card tone="green" className="rounded-md shadow-sm">
        <CardHeader tone="green" className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <IconCircle icon={Scale} tone="green" size="sm" />
            Saldo pro Person
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Teilnehmer.</p>
          ) : (
            balances.map((b) => (
              <div
                key={b.memberId}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
                  highlightMemberId === b.memberId
                    ? "border-emerald-400/60 bg-emerald-100/50"
                    : "border-emerald-200/70 bg-white/70"
                )}
              >
                <span className="font-medium">{b.displayName}</span>
                <span
                  className={
                    b.netBalance > 0
                      ? "font-semibold text-emerald-700"
                      : b.netBalance < 0
                        ? "font-semibold text-rose-600"
                        : "text-muted-foreground"
                  }
                >
                  {formatSignedMoney(b.netBalance, baseCurrency)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card tone="amber" className="rounded-md shadow-sm">
        <CardHeader tone="amber" className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <IconCircle icon={ArrowLeftRight} tone="amber" size="sm" />
            Ausgleichsvorschläge
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {simplifiedDebts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Alles ausgeglichen.</p>
          ) : (
            simplifiedDebts.map((d, i) => (
              <div
                key={`${d.fromMemberId}-${d.toMemberId}-${i}`}
                className="rounded-md border border-amber-200/70 bg-white/70 px-3 py-2 text-sm"
              >
                <span className="font-medium">{d.fromDisplayName}</span>
                {" schuldet "}
                <span className="font-medium">{d.toDisplayName}</span>
                {" "}
                <span className="font-semibold text-amber-900">
                  {formatMoney(d.amount, baseCurrency)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExpenseCard({
  exp,
  members,
  baseCurrency,
  cashbookMode,
  onDelete,
  canDelete,
  canEdit,
  receiptUploadUrl,
  onReceiptChanged,
  onGenerateAiImage,
  onDeleteAiImage,
  onResendMail,
  onUpdate,
  aiImageBusy,
  mailBusy,
  editBusy,
}: {
  exp: ExpenseListItem;
  members: Array<{ id: number; display_name: string }>;
  baseCurrency: string;
  cashbookMode?: boolean;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
  canEdit?: boolean;
  receiptUploadUrl?: string;
  onReceiptChanged?: () => void;
  onGenerateAiImage?: (expenseId: number) => void;
  onDeleteAiImage?: (expenseId: number) => void;
  onResendMail?: (expenseId: number) => void;
  onUpdate?: (expenseId: number, payload: ExpenseEditPayload) => Promise<void>;
  aiImageBusy?: boolean;
  mailBusy?: boolean;
  editBusy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [editDesc, setEditDesc] = useState(exp.description || "");
  const [editDate, setEditDate] = useState(exp.expense_date || "");
  const [editPayer, setEditPayer] = useState(String(exp.paid_by_member_id));
  const [editPlace, setEditPlace] = useState(exp.place_name || "");
  const [editNote, setEditNote] = useState(exp.note || "");
  const [editAmount, setEditAmount] = useState(String(exp.amount));
  const [editCurrency, setEditCurrency] = useState(exp.currency);
  const [editRate, setEditRate] = useState(String(exp.exchange_rate ?? 1));
  const [editRateLoading, setEditRateLoading] = useState(false);
  const [editDirection, setEditDirection] = useState<"expense" | "income">(
    exp.direction === "income" ? "income" : "expense"
  );

  const isIncome = (exp.direction || "expense") === "income";
  const memberName = (id: number) =>
    members.find((m) => m.id === id)?.display_name ?? `#${id}`;

  const visual = expenseVisualForExpense(exp);
  const surface = toneSurface(visual.tone);
  const isoDate = toIsoDateOnly(exp.expense_date);
  const fx = formatMoneyFxSummary({
    amount: exp.amount,
    currency: exp.currency,
    amountBase: exp.amount_base,
    baseCurrency,
    exchangeRate: exp.exchange_rate,
  });

  function startEdit() {
    setEditDesc(exp.description || "");
    setEditDate(exp.expense_date || "");
    setEditPayer(String(exp.paid_by_member_id));
    setEditPlace(exp.place_name || "");
    setEditNote(exp.note || "");
    setEditAmount(String(exp.amount));
    setEditCurrency(exp.currency);
    setEditRate(String(exp.exchange_rate ?? 1));
    setEditDirection(exp.direction === "income" ? "income" : "expense");
    setEditing(true);
  }

  async function fetchEditRate(from: string) {
    if (from === baseCurrency) {
      setEditRate("1");
      return;
    }
    setEditRateLoading(true);
    try {
      const params = new URLSearchParams({ from, to: baseCurrency });
      if (editDate) params.set("date", editDate);
      const res = await fetch(`/api/finance-ledgers/exchange-rate?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kurs laden fehlgeschlagen");
      setEditRate(String(json.rate));
    } catch {
      /* keep previous rate */
    } finally {
      setEditRateLoading(false);
    }
  }

  async function saveEdit() {
    if (!onUpdate) return;
    const parsedAmount = Number(editAmount);
    const parsedRate = Number(editRate) || 1;
    if (!(parsedAmount > 0)) return;
    await onUpdate(exp.id, {
      description: editDesc.trim() || null,
      expenseDate: editDate || null,
      paidByMemberId: Number(editPayer) || exp.paid_by_member_id,
      place: editPlace.trim() || null,
      note: editNote.trim() || null,
      amount: parsedAmount,
      currency: editCurrency,
      exchangeRate: editCurrency === baseCurrency ? 1 : parsedRate,
      direction: cashbookMode ? editDirection : undefined,
    });
    setEditing(false);
  }

  return (
    <div className="relative pl-5 sm:pl-6">
      <IconCircle
        icon={visual.icon}
        tone={visual.tone}
        size="md"
        className="absolute left-0 top-1 z-10 border-2 border-foreground/15 shadow-md"
      />
      <div
        className={cn(
          "overflow-hidden rounded-md border-2 text-sm shadow-sm",
          surface.body
        )}
      >
        <div
          className={cn(
            "border-b px-3 py-2.5 pl-7 sm:pl-8",
            surface.title
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 shrink-0">
              {isoDate ? (
                <CalendarDateBadge
                  isoDate={isoDate}
                  className="h-20 w-[4.75rem] sm:h-24 sm:w-[5.1rem]"
                />
              ) : (
                <span className="text-xs font-medium text-muted-foreground">
                  Ohne Datum
                </span>
              )}
            </div>
            <div className="ml-auto flex shrink-0 items-center">
              {exp.ai_image_url ? (
                <div className="relative">
                  <button
                    type="button"
                    title="Vergrössern"
                    className="block"
                    onClick={() => setZoomOpen(true)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={exp.ai_image_url}
                      alt=""
                      className="h-20 w-20 rounded-md border border-foreground/10 object-cover shadow-sm sm:h-24 sm:w-24"
                    />
                  </button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    className="absolute bottom-1 right-1 size-6 border border-border/70 bg-background/90 shadow-sm"
                    title="Vergrössern"
                    onClick={() => setZoomOpen(true)}
                  >
                    <Maximize2 className="size-3" />
                  </Button>
                </div>
              ) : aiImageBusy ? (
                <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-foreground/20 bg-background/50 text-[10px] text-muted-foreground sm:h-24 sm:w-24">
                  KI…
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-3 py-2.5 pl-7 sm:pl-8">
          {/* Fixed block for title / meta / place so cards align without shifting the header */}
          <div className="flex min-h-[4.5rem] flex-col justify-center gap-1">
            <p className="text-base font-bold leading-snug text-foreground">
              {exp.description || (isIncome ? "Einnahme" : "Ausgabe")}
            </p>
            <p className="text-xs text-muted-foreground">
              <span
                className={cn(
                  "mr-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  surface.soft
                )}
              >
                {isIncome ? "Einnahme" : visual.label}
              </span>
              {cashbookMode ? (
                <>
                  <span
                    className={cn(
                      "font-semibold",
                      isIncome ? "text-emerald-700" : "text-foreground"
                    )}
                  >
                    {isIncome ? "+" : "−"}
                    {fx.primary}
                  </span>
                </>
              ) : (
                <>
                  Bezahlt von {memberName(exp.paid_by_member_id)} · {fx.primary}
                </>
              )}
            </p>
            {fx.detail ? (
              <div className="space-y-0.5 text-[11px] leading-snug text-muted-foreground">
                <p>Währung: {exp.currency.toUpperCase()}</p>
                <p>FW Betrag: {fx.primary}</p>
                <p className="text-[12px] font-bold text-foreground">
                  Betrag {baseCurrency}:{" "}
                  {formatMoney(exp.amount_base, baseCurrency)}
                </p>
                <p>
                  Kurs:{" "}
                  {formatExchangeRateLine({
                    currency: exp.currency,
                    baseCurrency,
                    exchangeRate: exp.exchange_rate,
                    amount: exp.amount,
                    amountBase: exp.amount_base,
                  })}
                </p>
              </div>
            ) : null}
            <p className="flex min-h-[1rem] items-center gap-1 text-xs text-muted-foreground">
              {exp.place_name ? (
                <>
                  <MapPin className="size-3 shrink-0" />
                  <span className="break-words">{exp.place_name}</span>
                </>
              ) : (
                <span className="invisible select-none">—</span>
              )}
            </p>
            {exp.note?.trim() ? (
              <p className="break-words text-xs text-muted-foreground">
                Notiz: {exp.note.trim()}
              </p>
            ) : null}
          </div>

            {editing && canEdit && onUpdate ? (
              <div className="mt-3 grid gap-2 rounded-md border border-border/50 bg-background/60 p-2.5 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Beschreibung</Label>
                  <Input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Betrag</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Währung</Label>
                  <Select
                    value={editCurrency}
                    onValueChange={(v) => {
                      if (v == null) return;
                      setEditCurrency(v);
                      if (v === baseCurrency) {
                        setEditRate("1");
                      } else {
                        void fetchEditRate(v);
                      }
                    }}
                    items={Object.fromEntries(
                      COMMON_CURRENCIES.map((c) => [c, c])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kurs → {baseCurrency}</Label>
                  <div className="flex gap-1.5">
                    <Input
                      type="number"
                      step="0.0001"
                      value={editRate}
                      disabled={editCurrency === baseCurrency}
                      onChange={(e) => setEditRate(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="EZB-Kurs laden"
                      disabled={
                        editRateLoading || editCurrency === baseCurrency
                      }
                      onClick={() => void fetchEditRate(editCurrency)}
                    >
                      <Download
                        className={cn(
                          "size-4",
                          editRateLoading && "animate-pulse"
                        )}
                      />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Datum</Label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </div>
                {cashbookMode ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Typ</Label>
                    <Select
                      value={editDirection}
                      onValueChange={(v) => {
                        if (v == null) return;
                        setEditDirection(v as "expense" | "income");
                      }}
                      items={{
                        expense: "Ausgabe",
                        income: "Einnahme",
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Ausgabe</SelectItem>
                        <SelectItem value="income">Einnahme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs">Bezahlt von</Label>
                    <Select
                      value={editPayer}
                      onValueChange={(v) => {
                        if (v == null) return;
                        setEditPayer(v);
                      }}
                      items={Object.fromEntries(
                        members.map((m) => [String(m.id), m.display_name])
                      )}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Ort</Label>
                  <Input
                    value={editPlace}
                    onChange={(e) => setEditPlace(e.target.value)}
                    placeholder="z. B. Denny’s, Las Vegas"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Notiz</Label>
                  <Textarea
                    rows={2}
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                {editCurrency !== baseCurrency && Number(editAmount) > 0 ? (
                  <p className="text-[11px] text-muted-foreground sm:col-span-2">
                    ≈{" "}
                    {formatMoney(
                      Number(editAmount) * (Number(editRate) || 1),
                      baseCurrency
                    )}{" "}
                    bei Kurs {editRate || "—"}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button
                    size="sm"
                    disabled={editBusy || !(Number(editAmount) > 0)}
                    onClick={() => void saveEdit()}
                  >
                    Speichern
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={editBusy}
                    onClick={() => setEditing(false)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-foreground/10 pt-2">
          {receiptUploadUrl ? (
            <ExpenseReceiptControls
              expenseId={exp.id}
              receiptUrl={exp.receipt_url}
              uploadUrl={receiptUploadUrl}
              onChanged={onReceiptChanged}
              compact
            />
          ) : exp.receipt_url ? (
            <a
              href={exp.receipt_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={exp.receipt_url}
                alt="Beleg"
                className="h-10 w-10 rounded border border-border/60 object-cover"
              />
            </a>
          ) : null}

          {canEdit && onUpdate && !editing ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={startEdit}
            >
              <Pencil className="mr-1 size-3.5" />
              Bearbeiten
            </Button>
          ) : null}

          {onGenerateAiImage ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={aiImageBusy}
              onClick={() => onGenerateAiImage(exp.id)}
            >
              <RefreshCw
                className={cn("mr-1 size-3.5", aiImageBusy && "animate-spin")}
              />
              {exp.ai_image_url ? "KI-Bild neu" : "KI-Bild"}
            </Button>
          ) : null}

          {onResendMail ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={mailBusy || aiImageBusy}
              onClick={() => onResendMail(exp.id)}
              title="Belegmail erneut an die Gruppe senden"
            >
              <Mail
                className={cn("mr-1 size-3.5", mailBusy && "animate-pulse")}
              />
              {mailBusy ? "Sendet…" : "Mail erneut"}
            </Button>
          ) : null}

          {exp.ai_image_url && onDeleteAiImage ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive"
              disabled={aiImageBusy}
              onClick={() => onDeleteAiImage(exp.id)}
              title="KI-Bild löschen"
            >
              <Trash2 className="mr-1 size-3.5" />
              KI-Bild
            </Button>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            {canDelete && onDelete ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                title="Ausgabe löschen"
                onClick={() => onDelete(exp.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
        </div>
      </div>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-h-[90dvh] w-[min(96vw,40rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{exp.description || "KI-Bild"}</DialogTitle>
            <DialogDescription>Vergrösserte Ansicht</DialogDescription>
          </DialogHeader>
          {exp.ai_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={exp.ai_image_url}
              alt={exp.description || "KI-Bild"}
              className="mx-auto max-h-[70vh] w-full rounded-md object-contain"
            />
          ) : null}
          {onDeleteAiImage || onGenerateAiImage ? (
            <DialogFooter className="gap-2 sm:gap-0">
              {onGenerateAiImage ? (
                <Button
                  variant="secondary"
                  disabled={aiImageBusy}
                  onClick={() => onGenerateAiImage(exp.id)}
                >
                  Neu generieren
                </Button>
              ) : null}
              {onDeleteAiImage ? (
                <Button
                  variant="destructive"
                  disabled={aiImageBusy}
                  onClick={() => {
                    onDeleteAiImage(exp.id);
                    setZoomOpen(false);
                  }}
                >
                  <Trash2 className="mr-1 size-3.5" />
                  Bild löschen
                </Button>
              ) : null}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ExpenseList({
  expenses,
  members,
  baseCurrency,
  cashbookMode,
  onDelete,
  canDelete,
  canEdit,
  receiptUploadUrl,
  onReceiptChanged,
  onGenerateAiImage,
  onDeleteAiImage,
  onResendMail,
  onUpdateExpense,
  aiImageBusyId,
  mailBusyId,
  editBusyId,
}: {
  expenses: ExpenseListItem[];
  members: Array<{ id: number; display_name: string }>;
  baseCurrency: string;
  cashbookMode?: boolean;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
  canEdit?: boolean;
  receiptUploadUrl?: (expenseId: number) => string;
  onReceiptChanged?: () => void;
  onGenerateAiImage?: (expenseId: number) => void;
  onDeleteAiImage?: (expenseId: number) => void;
  onResendMail?: (expenseId: number) => void;
  onUpdateExpense?: (
    expenseId: number,
    payload: ExpenseEditPayload
  ) => Promise<void>;
  aiImageBusyId?: number | null;
  mailBusyId?: number | null;
  editBusyId?: number | null;
}) {
  return (
    <div className="space-y-3">
      {expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {cashbookMode ? "Noch keine Buchungen." : "Noch keine Ausgaben."}
        </p>
      ) : (
        expenses.map((exp) => (
          <ExpenseCard
            key={exp.id}
            exp={exp}
            members={members}
            baseCurrency={baseCurrency}
            cashbookMode={cashbookMode}
            canDelete={canDelete}
            canEdit={canEdit}
            onDelete={onDelete}
            receiptUploadUrl={
              receiptUploadUrl ? receiptUploadUrl(exp.id) : undefined
            }
            onReceiptChanged={onReceiptChanged}
            onGenerateAiImage={onGenerateAiImage}
            onDeleteAiImage={onDeleteAiImage}
            onResendMail={onResendMail}
            onUpdate={onUpdateExpense}
            aiImageBusy={aiImageBusyId === exp.id}
            mailBusy={mailBusyId === exp.id}
            editBusy={editBusyId === exp.id}
          />
        ))
      )}
    </div>
  );
}

export type SettlementEditPayload = {
  fromMemberId: number;
  toMemberId: number;
  amount: number;
  currency: string;
  exchangeRate: number;
  note: string | null;
  settledAt: string | null;
};

export function SettlementList({
  settlements,
  members,
  baseCurrency,
  canEdit,
  canDelete,
  onUpdate,
  onDelete,
  editBusyId,
}: {
  settlements: Array<{
    id: number;
    from_member_id: number;
    to_member_id: number;
    amount: number;
    currency: string;
    exchange_rate?: number;
    amount_base: number;
    note: string | null;
    settled_at: string;
  }>;
  members: Array<{ id: number; display_name: string }>;
  baseCurrency: string;
  canEdit?: boolean;
  canDelete?: boolean;
  onUpdate?: (
    settlementId: number,
    payload: SettlementEditPayload
  ) => Promise<void>;
  onDelete?: (settlementId: number) => void;
  editBusyId?: number | null;
}) {
  return (
    <div className="space-y-3">
      {settlements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Rückzahlungen.</p>
      ) : (
        settlements.map((s) => (
          <SettlementCard
            key={s.id}
            settlement={s}
            members={members}
            baseCurrency={baseCurrency}
            canEdit={canEdit}
            canDelete={canDelete}
            onUpdate={onUpdate}
            onDelete={onDelete}
            editBusy={editBusyId === s.id}
          />
        ))
      )}
    </div>
  );
}

function SettlementCard({
  settlement: s,
  members,
  baseCurrency,
  canEdit,
  canDelete,
  onUpdate,
  onDelete,
  editBusy,
}: {
  settlement: {
    id: number;
    from_member_id: number;
    to_member_id: number;
    amount: number;
    currency: string;
    exchange_rate?: number;
    amount_base: number;
    note: string | null;
    settled_at: string;
  };
  members: Array<{ id: number; display_name: string }>;
  baseCurrency: string;
  canEdit?: boolean;
  canDelete?: boolean;
  onUpdate?: (
    settlementId: number,
    payload: SettlementEditPayload
  ) => Promise<void>;
  onDelete?: (settlementId: number) => void;
  editBusy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [fromId, setFromId] = useState(String(s.from_member_id));
  const [toId, setToId] = useState(String(s.to_member_id));
  const [amount, setAmount] = useState(String(s.amount));
  const [currency, setCurrency] = useState(s.currency);
  const [rate, setRate] = useState(String(s.exchange_rate ?? 1));
  const [note, setNote] = useState(s.note || "");
  const [settledAt, setSettledAt] = useState(s.settled_at?.slice(0, 10) || "");

  const memberName = (id: number) =>
    members.find((m) => m.id === id)?.display_name ?? `#${id}`;
  const visual = settlementVisual();
  const surface = toneSurface(visual.tone);
  const fx = formatMoneyFxSummary({
    amount: s.amount,
    currency: s.currency,
    amountBase: s.amount_base,
    baseCurrency,
    exchangeRate: s.exchange_rate,
  });
  const settledLabel = formatDateDe(s.settled_at);

  function startEdit() {
    setFromId(String(s.from_member_id));
    setToId(String(s.to_member_id));
    setAmount(String(s.amount));
    setCurrency(s.currency);
    setRate(String(s.exchange_rate ?? 1));
    setNote(s.note || "");
    setSettledAt(s.settled_at?.slice(0, 10) || "");
    setEditing(true);
  }

  async function saveEdit() {
    if (!onUpdate) return;
    const parsedAmount = Number(amount);
    const parsedRate = Number(rate) || 1;
    if (!(parsedAmount > 0) || fromId === toId) return;
    await onUpdate(s.id, {
      fromMemberId: Number(fromId),
      toMemberId: Number(toId),
      amount: parsedAmount,
      currency,
      exchangeRate: currency === baseCurrency ? 1 : parsedRate,
      note: note.trim() || null,
      settledAt: settledAt || null,
    });
    setEditing(false);
  }

  return (
    <div className="relative pl-5 sm:pl-6">
      <IconCircle
        icon={visual.icon}
        tone={visual.tone}
        size="md"
        className="absolute left-0 top-1 z-10 border-2 border-foreground/15 shadow-md"
      />
      <div
        className={cn(
          "rounded-md border-2 py-2.5 pl-7 pr-3 text-sm shadow-sm sm:pl-8",
          surface.body
        )}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-snug">
              <span>{memberName(s.from_member_id)}</span>
              {" → "}
              <span>{memberName(s.to_member_id)}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fx.primary}
              {settledLabel ? ` · ${settledLabel}` : ""}
            </p>
            {fx.detail ? (
              <div className="mt-0.5 space-y-0.5 text-[11px] leading-snug text-muted-foreground">
                <p>Währung: {s.currency.toUpperCase()}</p>
                <p>FW Betrag: {fx.primary}</p>
                <p className="text-[12px] font-bold text-foreground">
                  Betrag {baseCurrency}:{" "}
                  {formatMoney(s.amount_base, baseCurrency)}
                </p>
                <p>
                  Kurs:{" "}
                  {formatExchangeRateLine({
                    currency: s.currency,
                    baseCurrency,
                    exchangeRate: s.exchange_rate,
                    amount: s.amount,
                    amountBase: s.amount_base,
                  })}
                </p>
              </div>
            ) : null}
            {s.note ? (
              <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>
            ) : null}

            {editing && canEdit && onUpdate ? (
              <div className="mt-3 grid gap-2 rounded-md border border-border/50 bg-background/60 p-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Von</Label>
                  <Select
                    value={fromId}
                    onValueChange={(v) => {
                      if (v == null) return;
                      setFromId(v);
                    }}
                    items={Object.fromEntries(
                      members.map((m) => [String(m.id), m.display_name])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">An</Label>
                  <Select
                    value={toId}
                    onValueChange={(v) => {
                      if (v == null) return;
                      setToId(v);
                    }}
                    items={Object.fromEntries(
                      members.map((m) => [String(m.id), m.display_name])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Betrag</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Währung</Label>
                  <Select
                    value={currency}
                    onValueChange={(v) => {
                      if (v == null) return;
                      setCurrency(v);
                      if (v === baseCurrency) setRate("1");
                    }}
                    items={Object.fromEntries(
                      COMMON_CURRENCIES.map((c) => [c, c])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kurs → {baseCurrency}</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={rate}
                    disabled={currency === baseCurrency}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Datum</Label>
                  <Input
                    type="date"
                    value={settledAt}
                    onChange={(e) => setSettledAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Notiz</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button
                    size="sm"
                    disabled={
                      editBusy || !(Number(amount) > 0) || fromId === toId
                    }
                    onClick={() => void saveEdit()}
                  >
                    Speichern
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={editBusy}
                    onClick={() => setEditing(false)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {canEdit && onUpdate && !editing ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                title="Bearbeiten"
                onClick={startEdit}
              >
                <Pencil className="size-3.5" />
              </Button>
            ) : null}
            {canDelete && onDelete ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                title="Rückzahlung löschen"
                onClick={() => onDelete(s.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  children,
  action,
  tone = "green",
  icon,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: IconTone;
  icon?: LucideIcon;
}) {
  const Icon = icon ?? Users;
  return (
    <Card tone={tone} className="rounded-md shadow-sm">
      <CardHeader
        tone={tone}
        className="flex flex-row items-center justify-between pb-2"
      >
        <CardTitle className="flex items-center gap-2 text-base">
          <IconCircle icon={Icon} tone={tone} size="sm" />
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
