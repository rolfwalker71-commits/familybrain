import { google } from "googleapis";
import {
  getAuthedGoogleClient,
  hasGoogleTasksScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";

export type GoogleTaskList = {
  id: string;
  title: string;
};

export type GoogleTaskItem = {
  id: string;
  listId: string;
  listTitle: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  status: "needsAction" | "completed" | string;
  overdue: boolean;
  href: string;
};

function zurichYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dueDateFromTask(due: string | null | undefined): string | null {
  if (!due) return null;
  // Tasks API returns RFC3339; date part is the due day.
  return due.slice(0, 10);
}

export async function listGoogleTaskLists(
  userId: number,
  request?: Request | null
): Promise<GoogleTaskList[]> {
  if (!isGoogleMailConnected(userId) || !hasGoogleTasksScope(userId)) {
    return [];
  }
  const auth = await getAuthedGoogleClient(userId, request);
  const tasks = google.tasks({ version: "v1", auth });
  const res = await tasks.tasklists.list({ maxResults: 100 });
  return (res.data.items || [])
    .map((t) => ({
      id: t.id || "",
      title: (t.title || "Aufgaben").trim(),
    }))
    .filter((t) => t.id);
}

/** Incomplete tasks: overdue + due within [today, today+horizonDays], plus undated (capped). */
export async function listUpcomingGoogleTasks(
  userId: number,
  options?: {
    horizonDays?: number;
    undatedLimit?: number;
    request?: Request | null;
  }
): Promise<GoogleTaskItem[]> {
  if (!isGoogleMailConnected(userId) || !hasGoogleTasksScope(userId)) {
    return [];
  }
  const horizonDays = options?.horizonDays ?? 7;
  const undatedLimit = options?.undatedLimit ?? 8;
  const today = zurichYmd();
  const horizon = addDaysIso(today, horizonDays);

  const auth = await getAuthedGoogleClient(userId, options?.request);
  const tasksApi = google.tasks({ version: "v1", auth });
  const lists = await listGoogleTaskLists(userId, options?.request);
  if (lists.length === 0) return [];

  const out: GoogleTaskItem[] = [];
  let undated = 0;

  for (const list of lists) {
    let pageToken: string | undefined;
    do {
      const res = await tasksApi.tasks.list({
        tasklist: list.id,
        showCompleted: false,
        showHidden: false,
        maxResults: 100,
        pageToken,
      });
      for (const t of res.data.items || []) {
        if (!t.id || t.deleted) continue;
        if ((t.status || "").toLowerCase() === "completed") continue;
        const dueDate = dueDateFromTask(t.due);
        const title = (t.title || "").trim() || "Aufgabe";
        if (!dueDate) {
          if (undated >= undatedLimit) continue;
          undated += 1;
          out.push({
            id: t.id,
            listId: list.id,
            listTitle: list.title,
            title,
            notes: t.notes?.trim() || null,
            dueDate: null,
            status: t.status || "needsAction",
            overdue: false,
            href: "https://tasks.google.com/",
          });
          continue;
        }
        if (dueDate > horizon) continue;
        out.push({
          id: t.id,
          listId: list.id,
          listTitle: list.title,
          title,
          notes: t.notes?.trim() || null,
          dueDate,
          status: t.status || "needsAction",
          overdue: dueDate < today,
          href: "https://tasks.google.com/",
        });
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
  }

  out.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const da = a.dueDate || "9999-99-99";
    const db = b.dueDate || "9999-99-99";
    const c = da.localeCompare(db);
    if (c !== 0) return c;
    return a.title.localeCompare(b.title, "de");
  });

  return out;
}

/** Offene + kürzlich erledigte Tasks für Tagesanalyse-Abgleich. */
export async function listGoogleTasksForMatch(
  userId: number,
  options?: {
    completedWithinDays?: number;
    maxPerList?: number;
    request?: Request | null;
  }
): Promise<
  Array<{
    id: string;
    title: string;
    notes: string | null;
    status: "open" | "done";
    doneAt: string | null;
    href: string | null;
  }>
> {
  if (!isGoogleMailConnected(userId) || !hasGoogleTasksScope(userId)) {
    return [];
  }
  const completedWithinDays = options?.completedWithinDays ?? 30;
  const maxPerList = options?.maxPerList ?? 100;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - completedWithinDays);
  const cutoffMs = cutoff.getTime();

  const auth = await getAuthedGoogleClient(userId, options?.request);
  const tasksApi = google.tasks({ version: "v1", auth });
  const lists = await listGoogleTaskLists(userId, options?.request);
  if (lists.length === 0) return [];

  const out: Array<{
    id: string;
    title: string;
    notes: string | null;
    status: "open" | "done";
    doneAt: string | null;
    href: string | null;
  }> = [];

  for (const list of lists) {
    let pageToken: string | undefined;
    let taken = 0;
    do {
      const res = await tasksApi.tasks.list({
        tasklist: list.id,
        showCompleted: true,
        showHidden: true,
        maxResults: 100,
        pageToken,
      });
      for (const t of res.data.items || []) {
        if (!t.id || t.deleted) continue;
        const title = (t.title || "").trim();
        if (!title) continue;
        const isDone = (t.status || "").toLowerCase() === "completed";
        const doneAt = t.completed || null;
        if (isDone) {
          if (!doneAt) continue;
          const doneMs = Date.parse(doneAt);
          if (Number.isFinite(doneMs) && doneMs < cutoffMs) continue;
        }
        out.push({
          id: t.id,
          title,
          notes: t.notes?.trim() || null,
          status: isDone ? "done" : "open",
          doneAt,
          href: "https://tasks.google.com/",
        });
        taken += 1;
        if (taken >= maxPerList) break;
      }
      if (taken >= maxPerList) break;
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
  }

  return out;
}

export async function createGoogleTask(
  userId: number,
  input: {
    title: string;
    notes?: string | null;
    dueDate?: string | null;
    tasklistId?: string | null;
  },
  request?: Request | null
): Promise<GoogleTaskItem> {
  if (!hasGoogleTasksScope(userId)) {
    throw new Error(
      "Google Tasks-Recht fehlt — bitte unter Konto neu verbinden."
    );
  }
  const auth = await getAuthedGoogleClient(userId, request);
  const tasksApi = google.tasks({ version: "v1", auth });
  let listId = input.tasklistId?.trim() || "";
  if (!listId) {
    const lists = await listGoogleTaskLists(userId, request);
    listId = lists[0]?.id || "@default";
  }
  const due = input.dueDate?.trim();
  const res = await tasksApi.tasks.insert({
    tasklist: listId,
    requestBody: {
      title: input.title.trim().slice(0, 200),
      notes: input.notes?.trim() || undefined,
      due: due ? `${due}T00:00:00.000Z` : undefined,
    },
  });
  const id = res.data.id;
  if (!id) throw new Error("Task konnte nicht angelegt werden.");
  const today = zurichYmd();
  const dueDate = dueDateFromTask(res.data.due) || due || null;
  return {
    id,
    listId,
    listTitle: "",
    title: res.data.title || input.title,
    notes: res.data.notes || input.notes || null,
    dueDate,
    status: res.data.status || "needsAction",
    overdue: Boolean(dueDate && dueDate < today),
    href: "https://tasks.google.com/",
  };
}

/** Erledigen und/oder Fälligkeit neu setzen. */
export async function updateGoogleTask(
  userId: number,
  input: {
    taskId: string;
    listId: string;
    status?: "needsAction" | "completed";
    dueDate?: string | null;
  },
  request?: Request | null
): Promise<GoogleTaskItem> {
  if (!hasGoogleTasksScope(userId)) {
    throw new Error(
      "Google Tasks-Recht fehlt — bitte unter Konto neu verbinden."
    );
  }
  const auth = await getAuthedGoogleClient(userId, request);
  const tasksApi = google.tasks({ version: "v1", auth });
  const body: {
    id: string;
    status?: string;
    due?: string | null;
  } = { id: input.taskId };
  if (input.status) body.status = input.status;
  if (input.dueDate !== undefined) {
    body.due = input.dueDate
      ? `${input.dueDate}T00:00:00.000Z`
      : null;
  }
  const res = await tasksApi.tasks.patch({
    tasklist: input.listId,
    task: input.taskId,
    requestBody: body,
  });
  const today = zurichYmd();
  const dueDate = dueDateFromTask(res.data.due);
  return {
    id: res.data.id || input.taskId,
    listId: input.listId,
    listTitle: "",
    title: (res.data.title || "").trim() || "Aufgabe",
    notes: res.data.notes?.trim() || null,
    dueDate,
    status: res.data.status || input.status || "needsAction",
    overdue: Boolean(dueDate && dueDate < today),
    href: "https://tasks.google.com/",
  };
}

/**
 * Panel-Ansicht: offene Tasks (weiter Horizont) + optional kürzlich erledigte.
 * Im Gegensatz zu listUpcomingGoogleTasks ohne undatiert-Cap und mit showCompleted.
 */
export async function listManagedGoogleTasks(
  userId: number,
  options?: {
    horizonDays?: number;
    includeCompleted?: boolean;
    completedWithinDays?: number;
    request?: Request | null;
  }
): Promise<GoogleTaskItem[]> {
  if (!isGoogleMailConnected(userId) || !hasGoogleTasksScope(userId)) {
    return [];
  }
  const horizonDays = options?.horizonDays ?? 45;
  const includeCompleted = Boolean(options?.includeCompleted);
  const completedWithinDays = options?.completedWithinDays ?? 21;
  const today = zurichYmd();
  const horizon = addDaysIso(today, horizonDays);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - completedWithinDays);
  const cutoffMs = cutoff.getTime();

  const auth = await getAuthedGoogleClient(userId, options?.request);
  const tasksApi = google.tasks({ version: "v1", auth });
  const lists = await listGoogleTaskLists(userId, options?.request);
  if (lists.length === 0) return [];

  const out: GoogleTaskItem[] = [];
  for (const list of lists) {
    let pageToken: string | undefined;
    do {
      const res = await tasksApi.tasks.list({
        tasklist: list.id,
        showCompleted: includeCompleted,
        showHidden: includeCompleted,
        maxResults: 100,
        pageToken,
      });
      for (const t of res.data.items || []) {
        if (!t.id || t.deleted) continue;
        const title = (t.title || "").trim() || "Aufgabe";
        const status = t.status || "needsAction";
        const isDone = status.toLowerCase() === "completed";
        const dueDate = dueDateFromTask(t.due);
        if (isDone) {
          if (!includeCompleted) continue;
          const doneAt = t.completed || null;
          if (!doneAt) continue;
          const doneMs = Date.parse(doneAt);
          if (Number.isFinite(doneMs) && doneMs < cutoffMs) continue;
        } else if (dueDate && dueDate > horizon) {
          continue;
        }
        out.push({
          id: t.id,
          listId: list.id,
          listTitle: list.title,
          title,
          notes: t.notes?.trim() || null,
          dueDate,
          status,
          overdue: Boolean(!isDone && dueDate && dueDate < today),
          href: "https://tasks.google.com/",
        });
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
  }

  out.sort((a, b) => {
    const aDone = a.status.toLowerCase() === "completed" ? 1 : 0;
    const bDone = b.status.toLowerCase() === "completed" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const da = a.dueDate || "9999-99-99";
    const db = b.dueDate || "9999-99-99";
    const c = da.localeCompare(db);
    if (c !== 0) return c;
    return a.title.localeCompare(b.title, "de");
  });
  return out;
}

/** Task in eine andere Google-Liste verschieben (kopieren + löschen). */
export async function moveGoogleTaskToList(
  userId: number,
  input: {
    taskId: string;
    listId: string;
    targetListId: string;
  },
  request?: Request | null
): Promise<GoogleTaskItem> {
  if (!hasGoogleTasksScope(userId)) {
    throw new Error(
      "Google Tasks-Recht fehlt — bitte unter Konto neu verbinden."
    );
  }
  const targetListId = input.targetListId.trim();
  if (!targetListId) throw new Error("Ziel-Liste fehlt.");
  if (targetListId === input.listId) {
    throw new Error("Aufgabe ist bereits in dieser Liste.");
  }
  const auth = await getAuthedGoogleClient(userId, request);
  const tasksApi = google.tasks({ version: "v1", auth });
  const current = await tasksApi.tasks.get({
    tasklist: input.listId,
    task: input.taskId,
  });
  const title = (current.data.title || "").trim() || "Aufgabe";
  const inserted = await tasksApi.tasks.insert({
    tasklist: targetListId,
    requestBody: {
      title,
      notes: current.data.notes || undefined,
      due: current.data.due || undefined,
      status: current.data.status || "needsAction",
    },
  });
  const newId = inserted.data.id;
  if (!newId) throw new Error("Verschieben fehlgeschlagen (keine neue ID).");
  try {
    await tasksApi.tasks.delete({
      tasklist: input.listId,
      task: input.taskId,
    });
  } catch {
    // Ziel ist angelegt — Quell-Löschen optional soft-fail
  }
  const lists = await listGoogleTaskLists(userId, request);
  const listTitle =
    lists.find((l) => l.id === targetListId)?.title || "Google Tasks";
  const today = zurichYmd();
  const dueDate = dueDateFromTask(inserted.data.due);
  const status = inserted.data.status || current.data.status || "needsAction";
  return {
    id: newId,
    listId: targetListId,
    listTitle,
    title: inserted.data.title || title,
    notes: inserted.data.notes?.trim() || current.data.notes?.trim() || null,
    dueDate,
    status,
    overdue: Boolean(
      status.toLowerCase() !== "completed" && dueDate && dueDate < today
    ),
    href: "https://tasks.google.com/",
  };
}
