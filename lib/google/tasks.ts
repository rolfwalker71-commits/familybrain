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
