import { graphFetch, graphJson } from "@/lib/microsoft/graph";

export type CreateOutlookEventInput = {
  title: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  notes?: string | null;
  /** Outlook categories (e.g. Buddy/Maringo). */
  categories?: string[] | null;
  /** Graph: Teams online meeting (Outlook only). */
  teamsMeeting?: boolean;
};

export type CreatedOutlookEvent = {
  id: string;
  subject: string;
  webLink: string | null;
  joinUrl: string | null;
};

export async function createOutlookCalendarEvent(
  userId: number,
  input: CreateOutlookEventInput
): Promise<CreatedOutlookEvent> {
  const allDay = input.allDay || !input.startTime;
  const categories =
    input.categories?.map((c) => c.trim()).filter(Boolean) || undefined;
  const teamsMeeting = Boolean(input.teamsMeeting) && !allDay;
  let body: Record<string, unknown>;
  if (allDay) {
    const endDate = (() => {
      const d = new Date(`${input.date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    body = {
      subject: input.title,
      isAllDay: true,
      start: { dateTime: `${input.date}T00:00:00`, timeZone: "Europe/Zurich" },
      end: { dateTime: `${endDate}T00:00:00`, timeZone: "Europe/Zurich" },
      location: input.location ? { displayName: input.location } : undefined,
      body: input.notes
        ? { contentType: "Text", content: input.notes }
        : undefined,
      categories,
    };
  } else {
    const startHm = input.startTime || "09:00";
    const endHm =
      input.endTime ||
      (() => {
        const [h, m] = startHm.split(":").map(Number);
        const endH = Math.min(23, (h || 9) + 1);
        return `${String(endH).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
      })();
    body = {
      subject: input.title,
      isAllDay: false,
      start: {
        dateTime: `${input.date}T${startHm}:00`,
        timeZone: "Europe/Zurich",
      },
      end: {
        dateTime: `${input.date}T${endHm}:00`,
        timeZone: "Europe/Zurich",
      },
      location: input.location ? { displayName: input.location } : undefined,
      body: input.notes
        ? { contentType: "Text", content: input.notes }
        : undefined,
      categories,
      ...(teamsMeeting
        ? {
            isOnlineMeeting: true,
            onlineMeetingProvider: "teamsForBusiness",
          }
        : {}),
    };
  }

  const created = await graphJson<{
    id?: string;
    subject?: string;
    webLink?: string | null;
    onlineMeeting?: { joinUrl?: string | null } | null;
    onlineMeetingUrl?: string | null;
  }>(userId, "/me/events", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { Prefer: 'outlook.timezone="Europe/Zurich"' },
  });
  if (!created.id) throw new Error("Outlook-Termin ohne ID.");
  return {
    id: created.id,
    subject: created.subject || input.title,
    webLink: created.webLink || null,
    joinUrl:
      created.onlineMeeting?.joinUrl ||
      created.onlineMeetingUrl ||
      null,
  };
}

export type CreateOutlookDraftInput = {
  to: string;
  subject: string;
  body: string;
  sourceMailId?: string | null;
};

export type CreatedOutlookDraft = {
  id: string;
  subject: string;
  webLink: string | null;
};

export async function createOutlookMailDraft(
  userId: number,
  input: CreateOutlookDraftInput
): Promise<CreatedOutlookDraft> {
  const to = input.to.trim();
  if (!to.includes("@")) throw new Error("Ungültige Empfänger-Adresse.");

  if (input.sourceMailId) {
    try {
      const draft = await graphJson<{
        id?: string;
        subject?: string;
        webLink?: string | null;
      }>(
        userId,
        `/me/messages/${encodeURIComponent(input.sourceMailId)}/createReply`,
        { method: "POST", body: JSON.stringify({}) }
      );
      if (draft.id) {
        const patched = await graphJson<{
          id?: string;
          subject?: string;
          webLink?: string | null;
        }>(userId, `/me/messages/${encodeURIComponent(draft.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            subject: input.subject,
            body: { contentType: "Text", content: input.body },
            toRecipients: [{ emailAddress: { address: to } }],
          }),
        });
        return {
          id: patched.id || draft.id,
          subject: patched.subject || input.subject,
          webLink: patched.webLink || draft.webLink || null,
        };
      }
    } catch {
      // Fallback: freier Entwurf
    }
  }

  const created = await graphJson<{
    id?: string;
    subject?: string;
    webLink?: string | null;
  }>(userId, "/me/messages", {
    method: "POST",
    body: JSON.stringify({
      subject: input.subject,
      body: { contentType: "Text", content: input.body },
      toRecipients: [{ emailAddress: { address: to } }],
    }),
  });
  if (!created.id) throw new Error("Outlook-Entwurf ohne ID.");
  return {
    id: created.id,
    subject: created.subject || input.subject,
    webLink: created.webLink || null,
  };
}

export type CreateOutlookTodoInput = {
  title: string;
  notes?: string | null;
  dueDate?: string | null;
};

export type CreatedOutlookTodo = {
  id: string;
  title: string;
  webLink: string | null;
};

type TodoList = {
  id?: string;
  displayName?: string;
  wellknownListName?: string | null;
};

export type OutlookTodoList = {
  id: string;
  displayName: string;
  wellknownListName: string | null;
};

export async function listOutlookTodoLists(
  userId: number
): Promise<OutlookTodoList[]> {
  const lists = await graphJson<{ value?: TodoList[] }>(
    userId,
    "/me/todo/lists?$top=50"
  );
  return (lists.value || [])
    .filter((l): l is TodoList & { id: string } => Boolean(l.id))
    .map((l) => ({
      id: l.id,
      displayName: (l.displayName || "Liste").trim() || "Liste",
      wellknownListName: l.wellknownListName ?? null,
    }));
}

async function resolveOutlookTodoList(
  userId: number
): Promise<{ id: string; displayName: string }> {
  const lists = await listOutlookTodoLists(userId);
  const list =
    lists.find((l) => l.wellknownListName === "defaultList") ||
    lists[0] ||
    null;
  if (!list?.id) {
    throw new Error(
      "Keine Microsoft To Do-Liste gefunden. Bitte Microsoft 365 neu verbinden (Scope Tasks.ReadWrite)."
    );
  }
  return {
    id: list.id,
    displayName: list.displayName,
  };
}

async function resolveOutlookTodoListId(userId: number): Promise<string> {
  return (await resolveOutlookTodoList(userId)).id;
}

type GraphTodoTask = {
  id?: string;
  title?: string;
  status?: string;
  body?: { content?: string | null; contentType?: string } | null;
  dueDateTime?: { dateTime?: string | null; timeZone?: string | null } | null;
  completedDateTime?: { dateTime?: string | null } | null;
};

function mapOutlookTodoStatus(
  status: string | undefined
): "open" | "done" {
  return (status || "").toLowerCase() === "completed" ? "done" : "open";
}

function todoDueYmd(
  due: GraphTodoTask["dueDateTime"]
): string | null {
  const raw = due?.dateTime?.trim();
  if (!raw) return null;
  const tz = (due?.timeZone || "").trim();

  // Lokale Wandzeit in Zürich / W. Europe → Datumsteil ist der Fälligkeitstag
  if (
    tz &&
    /Europe\/Zurich|W\. Europe Standard Time|Central European Standard Time|CET|CEST/i.test(
      tz
    ) &&
    !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
  ) {
    const day = raw.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  }

  let iso = raw;
  // Graph oft: "2026-08-09T22:00:00.0000000" ohne Z, timeZone=UTC
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) {
    iso = iso.replace(/\.\d{1,7}$/, "");
    if (!tz || /^UTC$|^Etc\/GMT$/i.test(tz)) {
      iso = `${iso}Z`;
    } else {
      const day = raw.slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
    }
  }

  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) {
    const day = raw.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export type OutlookTodoTaskItem = {
  id: string;
  listId: string;
  listTitle: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  status: "open" | "done";
  overdue: boolean;
  href: string;
};

function mapTodoItem(
  t: GraphTodoTask,
  listId: string,
  listTitle: string,
  today: string
): OutlookTodoTaskItem | null {
  if (!t.id || !(t.title || "").trim()) return null;
  const status = mapOutlookTodoStatus(t.status);
  const dueDate = todoDueYmd(t.dueDateTime);
  return {
    id: t.id,
    listId,
    listTitle,
    title: (t.title || "").trim(),
    notes: t.body?.content?.trim() || null,
    dueDate,
    status,
    overdue: Boolean(status === "open" && dueDate && dueDate < today),
    href: "https://to-do.office.com/tasks/",
  };
}

function zurichYmdTodo(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmdTodo(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Offene To-Do-Aufgaben über alle Listen (inkl. Gekennzeichnete E-Mails). */
export async function listOutlookTodoTasksUpcoming(
  userId: number,
  options?: {
    horizonDays?: number;
    undatedLimit?: number;
    maxPerList?: number;
    /** Hub: alle offenen, ohne Fälligkeits-Horizont. */
    allOpen?: boolean;
  }
): Promise<OutlookTodoTaskItem[]> {
  const horizonDays = options?.horizonDays ?? 7;
  const undatedLimit = options?.undatedLimit ?? (options?.allOpen ? 200 : 24);
  const maxPerList = options?.maxPerList ?? 100;
  const allOpen = Boolean(options?.allOpen);
  const lists = await listOutlookTodoLists(userId);
  const today = zurichYmdTodo();
  const horizon = addDaysYmdTodo(today, horizonDays);

  type TodoPage = {
    value?: GraphTodoTask[];
    "@odata.nextLink"?: string;
  };

  const collected: OutlookTodoTaskItem[] = [];

  async function collectFromList(list: OutlookTodoList) {
    const listId = list.id;
    const listTitle = list.displayName;

    let url: string | null =
      `/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=${maxPerList}&$filter=status ne 'completed'&$orderby=dueDateTime/dateTime asc`;

    const pushTask = (t: GraphTodoTask) => {
      if (mapOutlookTodoStatus(t.status) === "done") return;
      const item = mapTodoItem(t, listId, listTitle, today);
      if (!item) return;
      if (!item.dueDate) {
        collected.push(item);
        return;
      }
      if (!allOpen && item.dueDate > horizon) return;
      collected.push(item);
    };

    try {
      let pages = 0;
      while (url && pages < 5) {
        pages += 1;
        const page: TodoPage = await graphJson<TodoPage>(userId, url);
        for (const t of page.value || []) pushTask(t);
        const next: string | undefined = page["@odata.nextLink"];
        url = next
          ? next.replace("https://graph.microsoft.com/v1.0", "")
          : null;
        if ((page.value || []).length < maxPerList) break;
      }
    } catch {
      const page: TodoPage = await graphJson<TodoPage>(
        userId,
        `/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=${maxPerList}`
      );
      for (const t of page.value || []) pushTask(t);
    }
  }

  await Promise.all(lists.map((list) => collectFromList(list)));

  // Undatierte begrenzen; Flagged-E-Mails zuerst behalten.
  const dated = collected.filter((t) => t.dueDate);
  const undatedItems = collected.filter((t) => !t.dueDate);
  undatedItems.sort((a, b) => {
    const af = /kennzeich|flagged/i.test(a.listTitle) ? 0 : 1;
    const bf = /kennzeich|flagged/i.test(b.listTitle) ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.title.localeCompare(b.title, "de");
  });
  const out = [...dated, ...undatedItems.slice(0, undatedLimit)];

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

export async function updateOutlookTodoTask(
  userId: number,
  input: {
    taskId: string;
    listId?: string | null;
    status?: "notStarted" | "completed";
    dueDate?: string | null;
    title?: string | null;
    /** Ziel-Liste: Task wird kopiert + alte gelöscht (Graph hat kein Move). */
    moveToListId?: string | null;
  }
): Promise<OutlookTodoTaskItem> {
  let listId =
    input.listId?.trim() || (await resolveOutlookTodoListId(userId));
  const taskId = input.taskId.trim();
  const moveTo = input.moveToListId?.trim() || null;

  if (moveTo && moveTo !== listId) {
    const current = await graphJson<GraphTodoTask>(
      userId,
      `/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`
    );
    const createBody: Record<string, unknown> = {
      title:
        (input.title?.trim() || current.title || "").trim() || "Aufgabe",
      status:
        input.status ||
        (mapOutlookTodoStatus(current.status) === "done"
          ? "completed"
          : "notStarted"),
    };
    if (current.body?.content) {
      createBody.body = {
        content: current.body.content,
        contentType: current.body.contentType || "text",
      };
    }
    if (input.dueDate !== undefined) {
      if (input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
        createBody.dueDateTime = {
          dateTime: `${input.dueDate}T12:00:00`,
          timeZone: "Europe/Zurich",
        };
      } else {
        createBody.dueDateTime = null;
      }
    } else if (current.dueDateTime) {
      createBody.dueDateTime = current.dueDateTime;
    }

    const created = await graphJson<GraphTodoTask>(
      userId,
      `/me/todo/lists/${encodeURIComponent(moveTo)}/tasks`,
      { method: "POST", body: JSON.stringify(createBody) }
    );
    await graphFetch(
      userId,
      `/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: "DELETE" }
    );

    const lists = await listOutlookTodoLists(userId);
    const listTitle =
      lists.find((l) => l.id === moveTo)?.displayName || "To Do";
    const today = zurichYmdTodo();
    const mapped = mapTodoItem(created, moveTo, listTitle, today);
    if (!mapped) throw new Error("Verschobene Aufgabe ohne ID.");
    return mapped;
  }

  const body: Record<string, unknown> = {};
  if (input.status) body.status = input.status;
  if (input.title !== undefined) {
    const title = (input.title || "").trim();
    if (!title) throw new Error("Titel darf nicht leer sein.");
    body.title = title;
  }
  if (input.dueDate !== undefined) {
    if (input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
      // Mittag Zürich → stabiler Kalendertag beim Lesen (UTC-Konvertierung)
      body.dueDateTime = {
        dateTime: `${input.dueDate}T12:00:00`,
        timeZone: "Europe/Zurich",
      };
    } else {
      body.dueDateTime = null;
    }
  }
  if (Object.keys(body).length === 0) {
    throw new Error("Keine Änderung angegeben.");
  }
  const updated = await graphJson<GraphTodoTask>(
    userId,
    `/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
  const lists = await listOutlookTodoLists(userId);
  const listTitle =
    lists.find((l) => l.id === listId)?.displayName || "Tasks";
  const today = zurichYmdTodo();
  const mapped = mapTodoItem(updated, listId, listTitle, today);
  if (!mapped) {
    return {
      id: taskId,
      listId,
      listTitle,
      title: (updated.title || "").trim() || "Aufgabe",
      notes: updated.body?.content?.trim() || null,
      dueDate: todoDueYmd(updated.dueDateTime),
      status: mapOutlookTodoStatus(updated.status),
      overdue: false,
      href: "https://to-do.office.com/tasks/",
    };
  }
  return mapped;
}

/** Offene + kürzlich erledigte To-Do-Aufgaben für Tagesanalyse-Abgleich. */
export async function listOutlookTodoTasksForMatch(
  userId: number,
  options?: { completedWithinDays?: number; maxPerList?: number }
): Promise<
  Array<{
    id: string;
    title: string;
    notes: string | null;
    status: "open" | "done";
    doneAt: string | null;
    href: string | null;
    source: "todo";
  }>
> {
  const completedWithinDays = options?.completedWithinDays ?? 30;
  const maxPerList = options?.maxPerList ?? 80;
  const lists = await listOutlookTodoLists(userId);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - completedWithinDays);
  const cutoffMs = cutoff.getTime();

  const out: Array<{
    id: string;
    title: string;
    notes: string | null;
    status: "open" | "done";
    doneAt: string | null;
    href: string | null;
    source: "todo";
  }> = [];

  type TodoPage = {
    value?: GraphTodoTask[];
    "@odata.nextLink"?: string;
  };

  await Promise.all(
    lists.map(async (list) => {
      const local: typeof out = [];
      let url: string | null =
        `/me/todo/lists/${encodeURIComponent(list.id)}/tasks?$top=${maxPerList}&$orderby=lastModifiedDateTime desc`;
      let pages = 0;
      while (url && pages < 3) {
        pages += 1;
        const page: TodoPage = await graphJson<TodoPage>(userId, url);
        for (const t of page.value || []) {
          if (!t.id || !(t.title || "").trim()) continue;
          const status = mapOutlookTodoStatus(t.status);
          const doneAt = t.completedDateTime?.dateTime || null;
          if (status === "done") {
            if (!doneAt) continue;
            const doneMs = Date.parse(doneAt);
            if (Number.isFinite(doneMs) && doneMs < cutoffMs) continue;
          }
          local.push({
            id: t.id,
            title: (t.title || "").trim(),
            notes: t.body?.content?.trim() || null,
            status,
            doneAt,
            href: "https://to-do.office.com/tasks/",
            source: "todo" as const,
          });
        }
        const next: string | undefined = page["@odata.nextLink"];
        url = next
          ? next.replace("https://graph.microsoft.com/v1.0", "")
          : null;
        if ((page.value || []).length < maxPerList) break;
      }
      out.push(...local);
    })
  );

  return out;
}

/** Microsoft To Do Aufgabe (O365). */
export async function createOutlookTodoTask(
  userId: number,
  input: CreateOutlookTodoInput
): Promise<CreatedOutlookTodo> {
  const listId = await resolveOutlookTodoListId(userId);

  const body: Record<string, unknown> = {
    title: input.title.trim(),
  };
  if (input.notes?.trim()) {
    body.body = { content: input.notes.trim(), contentType: "text" };
  }
  if (input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    body.dueDateTime = {
      dateTime: `${input.dueDate}T12:00:00`,
      timeZone: "Europe/Zurich",
    };
  }

  const created = await graphJson<{
    id?: string;
    title?: string;
    webLink?: string | null;
  }>(userId, `/me/todo/lists/${encodeURIComponent(listId)}/tasks`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!created.id) throw new Error("Outlook-Aufgabe ohne ID.");
  return {
    id: created.id,
    title: created.title || input.title,
    webLink: created.webLink || null,
  };
}
