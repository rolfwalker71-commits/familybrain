"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MaringoTimeBookForm,
  type TimeBookFormDefaults,
  type TimeBookFormValues,
} from "@/components/maringo/maringo-time-book-form";

export function MaringoTimeBookDialog({
  open,
  onOpenChange,
  defaults,
  title = "Zeit buchen",
  description,
  submitLabel = "Auf Ticket buchen",
  editLineId,
  onBooked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: TimeBookFormDefaults | null;
  title?: string;
  description?: string;
  submitLabel?: string;
  /** Wenn gesetzt: PUT statt POST (löschen + neu in MARI). */
  editLineId?: number | null;
  onBooked?: () => void;
}) {
  async function submit(values: TimeBookFormValues) {
    const url = editLineId
      ? `/api/maringo/timekeeping/lines/${editLineId}`
      : "/api/maringo/timekeeping/lines";
    const res = await fetch(url, {
      method: editLineId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data.error ||
          (editLineId ? "Änderung fehlgeschlagen" : "Buchung fehlgeschlagen")
      );
    }
    onOpenChange(false);
    onBooked?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <MaringoTimeBookForm
          key={`${editLineId || "new"}-${defaults?.issueId || "x"}-${defaults?.projectNumber || ""}-${open}`}
          defaults={defaults}
          submitLabel={submitLabel}
          onSubmit={submit}
        />
      </DialogContent>
    </Dialog>
  );
}
