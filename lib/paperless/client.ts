import type {
  PaperlessCorrespondent,
  PaperlessDocument,
  PaperlessDocumentType,
  PaperlessPaginatedResponse,
  PaperlessTag,
} from "./types";

export class PaperlessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PaperlessError";
    this.status = status;
  }
}

function normalizeToken(token: string): string {
  let value = token.trim();
  // Users sometimes paste "Token abc..." or "Bearer abc..."
  value = value.replace(/^(Token|Bearer)\s+/i, "").trim();
  return value;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

export class PaperlessClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = normalizeToken(token);
  }

  private headers(accept = "application/json"): HeadersInit {
    return {
      Authorization: `Token ${this.token}`,
      Accept: accept,
    };
  }

  /**
   * Fetch with manual redirect handling so Authorization is preserved.
   * Node/fetch often strips Authorization on cross-origin or protocol redirects.
   */
  private async request<T>(path: string): Promise<T> {
    const response = await this.fetchRaw(path, "application/json");
    return response.json() as Promise<T>;
  }

  private async fetchRaw(path: string, accept = "*/*"): Promise<Response> {
    if (!this.token) {
      throw new PaperlessError(
        "Kein API-Token vorhanden. Bitte Token speichern und erneut testen.",
        401
      );
    }

    let url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const maxRedirects = 5;

    for (let i = 0; i < maxRedirects; i++) {
      const response = await fetch(url, {
        headers: this.headers(accept),
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(60_000),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new PaperlessError(
            `Paperless redirect without Location header (${response.status})`,
            response.status
          );
        }
        url = new URL(location, url).toString();
        continue;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new PaperlessError(
          `Paperless request failed (${response.status}): ${body || response.statusText}`,
          response.status
        );
      }

      return response;
    }

    throw new PaperlessError("Too many redirects while contacting Paperless", 310);
  }

  private async postForm(
    path: string,
    form: FormData
  ): Promise<Response> {
    if (!this.token) {
      throw new PaperlessError(
        "Kein API-Token vorhanden. Bitte Token speichern und erneut testen.",
        401
      );
    }
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.token}`,
        Accept: "application/json",
      },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new PaperlessError(
        `Paperless upload failed (${response.status}): ${body || response.statusText}`,
        response.status
      );
    }
    return response;
  }

  async testConnection(): Promise<{ ok: true; count?: number }> {
    // Prefer documents endpoint – most reliable auth check
    const data = await this.request<PaperlessPaginatedResponse<PaperlessDocument>>(
      "/api/documents/?page_size=1"
    );
    return { ok: true, count: data.count };
  }

  async listDocumentsPage(
    pageUrl?: string,
    options?: {
      pageSize?: number;
      ordering?: string;
      modifiedGte?: string;
      fields?: string;
    }
  ): Promise<PaperlessPaginatedResponse<PaperlessDocument>> {
    if (pageUrl) {
      return this.request(pageUrl);
    }
    const params = new URLSearchParams();
    params.set("page_size", String(options?.pageSize ?? 50));
    params.set("ordering", options?.ordering ?? "-modified");
    if (options?.modifiedGte) {
      params.set("modified__gte", options.modifiedGte);
    }
    if (options?.fields) {
      params.set("fields", options.fields);
    }
    return this.request(`/api/documents/?${params.toString()}`);
  }

  async listAllDocumentIds(): Promise<number[]> {
    const ids: number[] = [];
    let nextUrl: string | undefined;
    let first = true;
    while (first || nextUrl) {
      first = false;
      const page = await this.listDocumentsPage(nextUrl, {
        pageSize: 100,
        ordering: "id",
        fields: "id",
      });
      for (const doc of page.results) {
        ids.push(doc.id);
      }
      nextUrl = page.next ?? undefined;
    }
    return ids;
  }

  async getTag(id: number): Promise<PaperlessTag | null> {
    try {
      return await this.request<PaperlessTag>(`/api/tags/${id}/`);
    } catch {
      return null;
    }
  }

  async getDocumentType(id: number): Promise<PaperlessDocumentType | null> {
    try {
      return await this.request<PaperlessDocumentType>(`/api/document_types/${id}/`);
    } catch {
      return null;
    }
  }

  async getCorrespondent(id: number): Promise<PaperlessCorrespondent | null> {
    try {
      return await this.request<PaperlessCorrespondent>(
        `/api/correspondents/${id}/`
      );
    } catch {
      return null;
    }
  }

  async downloadDocument(
    paperlessId: number,
    original = false
  ): Promise<{ buffer: ArrayBuffer; contentType: string }> {
    const qs = original ? "?original=true" : "";
    const response = await this.fetchRaw(
      `/api/documents/${paperlessId}/download/${qs}`,
      "application/pdf,application/octet-stream,*/*"
    );
    const contentType =
      response.headers.get("content-type") || "application/pdf";
    const buffer = await response.arrayBuffer();
    return { buffer, contentType };
  }

  async getThumbnail(
    paperlessId: number
  ): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
    try {
      const response = await this.fetchRaw(
        `/api/documents/${paperlessId}/thumb/`,
        "image/*,*/*"
      );
      const contentType = response.headers.get("content-type") || "image/webp";
      const buffer = await response.arrayBuffer();
      return { buffer, contentType };
    } catch {
      return null;
    }
  }

  documentUiUrl(paperlessId: number): string {
    return `${this.baseUrl}/documents/${paperlessId}/`;
  }

  async getDocument(paperlessId: number): Promise<PaperlessDocument> {
    return this.request<PaperlessDocument>(`/api/documents/${paperlessId}/`);
  }

  /**
   * Upload a file for consumption. Returns the celery task UUID.
   */
  async postDocument(input: {
    buffer: Buffer;
    filename: string;
    title?: string | null;
  }): Promise<string> {
    const form = new FormData();
    const bytes = new Uint8Array(input.buffer);
    form.append(
      "document",
      new Blob([bytes], { type: "application/pdf" }),
      input.filename
    );
    if (input.title?.trim()) {
      form.append("title", input.title.trim());
    }
    const response = await this.postForm("/api/documents/post_document/", form);
    const raw = await response.text();
    let taskId = raw.trim();
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "string") taskId = parsed;
      else if (
        parsed &&
        typeof parsed === "object" &&
        "task_id" in parsed &&
        typeof (parsed as { task_id: unknown }).task_id === "string"
      ) {
        taskId = (parsed as { task_id: string }).task_id;
      }
    } catch {
      /* plain UUID string */
    }
    taskId = taskId.replace(/^"|"$/g, "").trim();
    if (!taskId) {
      throw new PaperlessError("Paperless lieferte keine Task-ID.", 502);
    }
    return taskId;
  }

  async getTaskById(taskId: string): Promise<{
    status: string;
    result: string | null;
    related_document: string | number | null;
  } | null> {
    const params = new URLSearchParams({ task_id: taskId });
    const response = await this.fetchRaw(
      `/api/tasks/?${params.toString()}`,
      "application/json"
    );
    const data = (await response.json()) as unknown;
    const rows = Array.isArray(data)
      ? data
      : data &&
          typeof data === "object" &&
          Array.isArray((data as { results?: unknown }).results)
        ? (data as { results: unknown[] }).results
        : [];
    const row = rows[0] as
      | {
          status?: string;
          result?: string | null;
          related_document?: string | number | null;
        }
      | undefined;
    if (!row) return null;
    return {
      status: String(row.status || ""),
      result: row.result ?? null,
      related_document: row.related_document ?? null,
    };
  }

  /**
   * Poll consumption until a document id is available (or timeout).
   */
  async waitForPostedDocument(
    taskId: string,
    options?: { timeoutMs?: number; intervalMs?: number }
  ): Promise<number> {
    const timeoutMs = options?.timeoutMs ?? 90_000;
    const intervalMs = options?.intervalMs ?? 1_500;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const task = await this.getTaskById(taskId);
      if (task) {
        const related = Number(task.related_document);
        if (Number.isFinite(related) && related > 0) return related;
        const fromResult =
          /document id (\d+)/i.exec(task.result || "") ||
          /#(\d+)/.exec(task.result || "");
        if (fromResult) {
          const id = Number(fromResult[1]);
          if (Number.isFinite(id) && id > 0) return id;
        }
        const status = task.status.toUpperCase();
        if (status === "FAILURE" || status === "REVOKED") {
          throw new PaperlessError(
            task.result?.trim() || "Paperless-Import fehlgeschlagen.",
            502
          );
        }
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new PaperlessError(
      "Paperless-Import dauert zu lange. Bitte später erneut versuchen.",
      504
    );
  }
}
