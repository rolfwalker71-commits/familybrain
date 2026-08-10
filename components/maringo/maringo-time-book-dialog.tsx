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
  onBooked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: TimeBookFormDefaults | null;
  title?: string;
  description?: string;
  onBooked?: () => void;
}) {
  async function submit(values: TimeBookFormValues) {
    const res = await fetch("/api/maringo/timekeeping/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Buchung fehlgeschlagen");
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
          key={`${defaults?.issueId || "x"}-${defaults?.projectNumber || ""}-${open}`}
          defaults={defaults}
          submitLabel="Auf Ticket buchen"
          onSubmit={submit}
        />
      </DialogContent>
    </Dialog>
  );
}
