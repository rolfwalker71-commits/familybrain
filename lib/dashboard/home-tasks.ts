import { hasGoogleTasksScope, isGoogleMailConnected } from "@/lib/google/oauth";
import { listUpcomingGoogleTasks } from "@/lib/google/tasks";
import {
  isMicrosoftConnected,
  hasMicrosoftTasksScope,
} from "@/lib/microsoft/oauth";
import { listOutlookTodoTasksUpcoming } from "@/lib/microsoft/mail-day-actions";
import { listMyPlannerTasks } from "@/lib/microsoft/planner";

export type HomeTaskSource = "google" | "todo" | "planner";

export type HomeTaskItem = {
  /** Stable UI key: source + ids */
  key: string;
  id: string;
  source: HomeTaskSource;
  title: string;
  dueDate: string | null;
  overdue: boolean;
  /** Legacy one-line meta (list / plan · bucket). */
  subtitle: string;
  /** Account chip: Google / Microsoft / Plan-Titel. */
  accountLabel: string;
  /** Bucket/list chip. */
  bucketLabel: string | null;
  href: string;
  listId: string | null;
  etag: string | null;
  /** Planner only */
  planId?: string | null;
  bucketId?: string | null;
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

export type HomeTasksBundle = {
  googleConnected: boolean;
  microsoftConnected: boolean;
  hasGoogleScope: boolean;
  hasMicrosoftScope: boolean;
  items: HomeTaskItem[];
};

/** Offene Aufgaben aus Google Tasks + Outlook To Do + Planner (Horizont). */
export async function loadHomeTasksBundle(
  userId: number | null,
  options?: { horizonDays?: number }
): Promise<HomeTasksBundle> {
  const horizonDays = options?.horizonDays ?? 7;
  const empty: HomeTasksBundle = {
    googleConnected: false,
    microsoftConnected: false,
    hasGoogleScope: false,
    hasMicrosoftScope: false,
    items: [],
  };
  if (userId == null) return empty;

  const googleConnected = isGoogleMailConnected(userId);
  const microsoftConnected = isMicrosoftConnected(userId);
  const hasGoogleScope = googleConnected && hasGoogleTasksScope(userId);
  const hasMicrosoftScope =
    microsoftConnected && hasMicrosoftTasksScope(userId);

  const today = zurichYmd();
  const horizon = addDaysIso(today, horizonDays);

  const [googleItems, todoItems, plannerItems] = await Promise.all([
    (async () => {
      if (!hasGoogleScope) return [] as HomeTaskItem[];
      try {
        const items = await listUpcomingGoogleTasks(userId, { horizonDays });
        return items.map((t) => ({
          key: `google:${t.listId}:${t.id}`,
          id: t.id,
          source: "google" as const,
          title: t.title,
          dueDate: t.dueDate,
          overdue: t.overdue,
          subtitle: t.listTitle || "Google Tasks",
          accountLabel: "Privat · Google",
          bucketLabel: t.listTitle || "Tasks",
          href: t.href,
          listId: t.listId,
          etag: null,
        }));
      } catch {
        return [] as HomeTaskItem[];
      }
    })(),
    (async () => {
      if (!hasMicrosoftScope) return [] as HomeTaskItem[];
      try {
        const items = await listOutlookTodoTasksUpcoming(userId, {
          horizonDays,
        });
        return items.map((t) => ({
          key: `todo:${t.listId}:${t.id}`,
          id: t.id,
          source: "todo" as const,
          title: t.title,
          dueDate: t.dueDate,
          overdue: t.overdue,
          subtitle: t.listTitle || "Outlook To Do",
          accountLabel: "Arbeit · Microsoft",
          bucketLabel: t.listTitle || "To Do",
          href: t.href,
          listId: t.listId,
          etag: null,
        }));
      } catch {
        return [] as HomeTaskItem[];
      }
    })(),
    (async () => {
      if (!hasMicrosoftScope) return [] as HomeTaskItem[];
      try {
        const items = await listMyPlannerTasks(userId, { openOnly: true });
        return items
          .filter((t) => {
            if (!t.dueDate) return true;
            return t.dueDate <= horizon;
          })
          .map((t) => {
            const plan = t.planTitle || "Planner";
            const bucket = t.bucketName || null;
            return {
              key: `planner:${t.id}`,
              id: t.id,
              source: "planner" as const,
              title: t.title,
              dueDate: t.dueDate,
              overdue: Boolean(t.dueDate && t.dueDate < today),
              subtitle: [plan, bucket].filter(Boolean).join(" · "),
              accountLabel: plan,
              bucketLabel: bucket,
              href: t.href,
              listId: null,
              etag: t.etag || null,
              planId: t.planId || null,
              bucketId: t.bucketId || null,
            };
          });
      } catch {
        return [] as HomeTaskItem[];
      }
    })(),
  ]);

  const items = [...googleItems, ...todoItems, ...plannerItems].sort(
    (a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const da = a.dueDate || "9999-99-99";
      const db = b.dueDate || "9999-99-99";
      const c = da.localeCompare(db);
      if (c !== 0) return c;
      return a.title.localeCompare(b.title, "de");
    }
  );

  return {
    googleConnected,
    microsoftConnected,
    hasGoogleScope,
    hasMicrosoftScope,
    items,
  };
}
