import { getDb } from "@/lib/db/client";
import { updateDeadline, updateDeadlineStatus } from "@/lib/db/queries";
import { resolveDocumentTriage } from "@/lib/documents/triage";
import { markDocumentsPaid } from "@/lib/finance/mark-paid";
import { buildInboxTaskBoard } from "@/lib/inbox/build-tasks";
import {
  addDaysIso,
  recordInboxTaskEvent,
  upsertInboxTaskState,
} from "@/lib/inbox/task-state";
import type {
  InboxSourceKind,
  InboxTaskAction,
  InboxTaskBoard,
} from "@/lib/inbox/types";
import { publishInboxRefresh } from "@/lib/realtime/hub";

function triageStillPending(documentLocalId: number): boolean {
  const row = getDb()
    .prepare(`SELECT triage_status FROM paperless_documents WHERE id = ?`)
    .get(documentLocalId) as { triage_status: string | null } | undefined;
  return row?.triage_status === "pending";
}

export async function applyInboxTaskAction(input: {
  sourceKind: InboxSourceKind;
  sourceId: string;
  action: InboxTaskAction;
  snoozeDays?: number;
}): Promise<{ ok: boolean; error?: string; board?: InboxTaskBoard }> {
  const { sourceKind, sourceId, action } = input;
  const days = Math.min(Math.max(input.snoozeDays ?? 7, 1), 90);

  try {
    if (action === "snooze") {
      if (sourceKind === "deadline") {
        const id = Number(sourceId);
        if (!Number.isInteger(id) || id <= 0) {
          return { ok: false, error: "Ungültige Frist" };
        }
        updateDeadline(id, {
          snoozedUntil: addDaysIso(days),
          manualOverride: true,
        });
      }
      if (sourceKind === "triage") {
        const id = Number(sourceId);
        if (!Number.isInteger(id) || id <= 0) {
          return { ok: false, error: "Ungültiges Dokument" };
        }
        if (triageStillPending(id)) {
          const result = await resolveDocumentTriage({
            documentLocalId: id,
            action: "snooze",
            snoozeDays: days,
          });
          if (!result.ok) return result;
        }
      }
      upsertInboxTaskState({
        sourceKind,
        sourceId,
        status: "snoozed",
        snoozedUntil: addDaysIso(days),
        completedAt: null,
      });
      recordInboxTaskEvent({
        sourceKind,
        sourceId,
        action: "snooze",
        detail: `+${days} Tage`,
      });
    } else if (action === "done") {
      if (sourceKind === "deadline") {
        const id = Number(sourceId);
        if (!Number.isInteger(id) || id <= 0) {
          return { ok: false, error: "Ungültige Frist" };
        }
        updateDeadlineStatus(id, "completed");
      }
      if (sourceKind === "triage") {
        const id = Number(sourceId);
        if (!Number.isInteger(id) || id <= 0) {
          return { ok: false, error: "Ungültiges Dokument" };
        }
        if (triageStillPending(id)) {
          const result = await resolveDocumentTriage({
            documentLocalId: id,
            action: "done",
            taxRelevant: false,
            taxYear: null,
          });
          if (!result.ok) return result;
        }
      }
      upsertInboxTaskState({
        sourceKind,
        sourceId,
        status: "done",
        snoozedUntil: null,
      });
      recordInboxTaskEvent({
        sourceKind,
        sourceId,
        action: "done",
      });
    } else if (action === "dismiss") {
      upsertInboxTaskState({
        sourceKind,
        sourceId,
        status: "dismissed",
        snoozedUntil: null,
      });
      recordInboxTaskEvent({
        sourceKind,
        sourceId,
        action: "dismiss",
      });
    } else if (action === "reopen") {
      if (sourceKind === "deadline") {
        const id = Number(sourceId);
        if (Number.isInteger(id) && id > 0) {
          updateDeadlineStatus(id, "open");
        }
      }
      upsertInboxTaskState({
        sourceKind,
        sourceId,
        status: "open",
        snoozedUntil: null,
        completedAt: null,
      });
      recordInboxTaskEvent({
        sourceKind,
        sourceId,
        action: "reopen",
      });
    } else if (action === "mark_paid") {
      if (sourceKind !== "invoice" && sourceKind !== "triage") {
        return {
          ok: false,
          error: "Als bezahlt nur für Rechnungen/Belege",
        };
      }
      const id = Number(sourceId);
      if (!Number.isInteger(id) || id <= 0) {
        return { ok: false, error: "Ungültiges Dokument" };
      }
      if (sourceKind === "triage") {
        await markDocumentsPaid([id]);
        if (triageStillPending(id)) {
          const result = await resolveDocumentTriage({
            documentLocalId: id,
            action: "done",
            taxRelevant: false,
            taxYear: null,
          });
          if (!result.ok) return result;
        }
      } else {
        await markDocumentsPaid([id]);
      }
      upsertInboxTaskState({
        sourceKind,
        sourceId,
        status: "done",
        snoozedUntil: null,
      });
      recordInboxTaskEvent({
        sourceKind,
        sourceId,
        action: "mark_paid",
      });
    } else {
      return { ok: false, error: "Unbekannte Aktion" };
    }

    try {
      publishInboxRefresh();
    } catch {
      /* optional */
    }

    return { ok: true, board: buildInboxTaskBoard() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
