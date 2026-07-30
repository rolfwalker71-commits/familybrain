import type {
  PaperlessCorrespondent,
  PaperlessCustomField,
  PaperlessDocument,
  PaperlessDocumentType,
  PaperlessPaginatedResponse,
  PaperlessTag,
} from "./types";
import { isPaidFieldName, isToPayFieldName } from "./custom-fields";

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
  private publicUrl: string;
  private token: string;

  constructor(
    baseUrl: string,
    token: string,
    publicUrl?: string | null
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.publicUrl = normalizeBaseUrl(publicUrl || baseUrl);
    this.token = normalizeToken(token);
  }

  /** API base used for server-side requests. */
  get apiBaseUrl(): string {
    return this.baseUrl;
  }

  /** Public UI base for browser links. */
  get uiBaseUrl(): string {
    return this.publicUrl;
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
  private async fetchRaw(
    path: string,
    accept = "*/*",
    init?: {
      method?: string;
      body?: string;
      contentType?: string;
    }
  ): Promise<Response> {
    if (!this.token) {
      throw new PaperlessError(
        "Kein API-Token vorhanden. Bitte Token speichern und erneut testen.",
        401
      );
    }

    let url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const maxRedirects = 5;
    const method = init?.method ?? "GET";

    for (let i = 0; i < maxRedirects; i++) {
      const headers: Record<string, string> = {
        Authorization: `Token ${this.token}`,
        Accept: accept,
      };
      if (init?.contentType) {
        headers["Content-Type"] = init.contentType;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: init?.body,
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
        // Redirects for mutating requests: follow as GET only if 303; else keep method
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

  private async requestJson<T>(
    path: string,
    init?: {
      method?: string;
      body?: unknown;
    }
  ): Promise<T> {
    const response = await this.fetchRaw(path, "application/json", {
      method: init?.method ?? "GET",
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      contentType:
        init?.body !== undefined ? "application/json" : undefined,
    });
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  private async request<T>(path: string): Promise<T> {
    return this.requestJson<T>(path);
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
      customFieldQuery?: string;
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
    if (options?.customFieldQuery) {
      params.set("custom_field_query", options.customFieldQuery);
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

  async listCustomFields(): Promise<PaperlessCustomField[]> {
    return this.listAllPages<PaperlessCustomField>("/api/custom_fields/");
  }

  private async listAllPages<T>(basePath: string): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | undefined;
    let first = true;
    const sep = basePath.includes("?") ? "&" : "?";
    while (first || nextUrl) {
      first = false;
      const page = nextUrl
        ? await this.request<PaperlessPaginatedResponse<T>>(nextUrl)
        : await this.request<PaperlessPaginatedResponse<T>>(
            `${basePath}${sep}page_size=100`
          );
      results.push(...(page.results || []));
      nextUrl = page.next ?? undefined;
    }
    return results;
  }

  async listTags(): Promise<PaperlessTag[]> {
    return this.listAllPages<PaperlessTag>("/api/tags/");
  }

  async createTag(name: string): Promise<PaperlessTag> {
    return this.requestJson<PaperlessTag>("/api/tags/", {
      method: "POST",
      body: { name },
    });
  }

  async ensureTag(
    name: string,
    cache?: Map<string, number>
  ): Promise<number> {
    const key = name.trim().toLowerCase();
    if (cache?.has(key)) return cache.get(key)!;
    const tags = await this.listTags();
    const existing = tags.find(
      (t) => t.name.trim().toLowerCase() === key
    );
    if (existing) {
      cache?.set(key, existing.id);
      return existing.id;
    }
    const created = await this.createTag(name.trim());
    cache?.set(key, created.id);
    return created.id;
  }

  async listCorrespondents(): Promise<PaperlessCorrespondent[]> {
    return this.listAllPages<PaperlessCorrespondent>("/api/correspondents/");
  }

  async createCorrespondent(name: string): Promise<PaperlessCorrespondent> {
    return this.requestJson<PaperlessCorrespondent>("/api/correspondents/", {
      method: "POST",
      body: { name },
    });
  }

  async ensureCorrespondent(
    name: string,
    cache?: Map<string, number>
  ): Promise<number> {
    const key = name.trim().toLowerCase();
    if (cache?.has(key)) return cache.get(key)!;
    const rows = await this.listCorrespondents();
    const existing = rows.find(
      (t) => t.name.trim().toLowerCase() === key
    );
    if (existing) {
      cache?.set(key, existing.id);
      return existing.id;
    }
    const created = await this.createCorrespondent(name.trim());
    cache?.set(key, created.id);
    return created.id;
  }

  async listDocumentTypes(): Promise<PaperlessDocumentType[]> {
    return this.listAllPages<PaperlessDocumentType>("/api/document_types/");
  }

  async findDocumentTypeIdByName(name: string): Promise<number | null> {
    const want = name.trim().toLowerCase();
    const types = await this.listDocumentTypes();
    const hit = types.find((t) => t.name.trim().toLowerCase() === want);
    return hit?.id ?? null;
  }

  /**
   * Merge-patch document: tags (union), custom_fields (by field id),
   * optional document_type / correspondent.
   */
  async setDocumentMetadata(
    paperlessId: number,
    input: {
      title?: string | null;
      addTagIds?: number[];
      documentTypeId?: number | null;
      correspondentId?: number | null;
      customFields?: Array<{ field: number; value: unknown }>;
    }
  ): Promise<PaperlessDocument> {
    const doc = await this.getDocument(paperlessId);
    const body: Record<string, unknown> = {};

    if (input.title?.trim()) {
      body.title = input.title.trim();
    }

    if (input.addTagIds && input.addTagIds.length > 0) {
      const existingTags = Array.isArray(doc.tags)
        ? doc.tags.map((t) =>
            typeof t === "number" ? t : Number((t as PaperlessTag).id)
          )
        : [];
      const tagSet = new Set<number>(
        [...existingTags, ...input.addTagIds].filter(
          (id) => Number.isFinite(id) && id > 0
        )
      );
      body.tags = [...tagSet];
    }

    if (input.documentTypeId !== undefined) {
      body.document_type = input.documentTypeId;
    }
    if (input.correspondentId !== undefined) {
      body.correspondent = input.correspondentId;
    }

    if (input.customFields && input.customFields.length > 0) {
      const existing = Array.isArray(doc.custom_fields)
        ? [...doc.custom_fields]
        : [];
      const byField = new Map<number, { field: number; value: unknown }>();
      for (const entry of existing) {
        if (entry && typeof entry.field === "number") {
          byField.set(entry.field, {
            field: entry.field,
            value: entry.value,
          });
        }
      }
      for (const cf of input.customFields) {
        if (cf.value === undefined) continue;
        byField.set(cf.field, { field: cf.field, value: cf.value });
      }
      body.custom_fields = [...byField.values()];
    }

    if (Object.keys(body).length === 0) return doc;
    return this.patchDocument(paperlessId, body);
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
    return `${this.publicUrl}/documents/${paperlessId}/`;
  }

  async getDocument(paperlessId: number): Promise<PaperlessDocument> {
    return this.request<PaperlessDocument>(`/api/documents/${paperlessId}/`);
  }

  /**
   * Permanently delete a document in Paperless.
   * 404 is treated as success (already gone).
   */
  async deleteDocument(paperlessId: number): Promise<void> {
    try {
      await this.fetchRaw(`/api/documents/${paperlessId}/`, "application/json", {
        method: "DELETE",
      });
    } catch (err) {
      if (err instanceof PaperlessError && err.status === 404) return;
      throw err;
    }
  }

  /**
   * PATCH document fields (e.g. custom_fields). Merging is caller's responsibility.
   */
  async patchDocument(
    paperlessId: number,
    body: Record<string, unknown>
  ): Promise<PaperlessDocument> {
    return this.requestJson<PaperlessDocument>(
      `/api/documents/${paperlessId}/`,
      { method: "PATCH", body }
    );
  }

  /**
   * Set payment UDFs «Bezahlt» / «Zu bezahlen» on a Paperless document.
   * Resolves field IDs from custom field definitions.
   */
  async setPaymentFlags(
    paperlessId: number,
    flags: { bezahlt?: boolean; zuBezahlen?: boolean },
    fieldDefs?: PaperlessCustomField[]
  ): Promise<PaperlessDocument> {
    const defs = fieldDefs ?? (await this.listCustomFields());
    let paidFieldId: number | null = null;
    let toPayFieldId: number | null = null;
    for (const def of defs) {
      if (paidFieldId == null && isPaidFieldName(def.name)) {
        paidFieldId = def.id;
      }
      if (toPayFieldId == null && isToPayFieldName(def.name)) {
        toPayFieldId = def.id;
      }
    }
    if (flags.bezahlt !== undefined && paidFieldId == null) {
      throw new PaperlessError(
        "Paperless-Feld «Bezahlt» wurde nicht gefunden.",
        400
      );
    }
    if (flags.zuBezahlen !== undefined && toPayFieldId == null) {
      throw new PaperlessError(
        "Paperless-Feld «Zu bezahlen» wurde nicht gefunden.",
        400
      );
    }

    const doc = await this.getDocument(paperlessId);
    const existing = Array.isArray(doc.custom_fields)
      ? [...doc.custom_fields]
      : [];
    const byField = new Map<number, { field: number; value: unknown }>();
    for (const entry of existing) {
      if (entry && typeof entry.field === "number") {
        byField.set(entry.field, { field: entry.field, value: entry.value });
      }
    }
    if (flags.bezahlt !== undefined && paidFieldId != null) {
      byField.set(paidFieldId, { field: paidFieldId, value: flags.bezahlt });
    }
    if (flags.zuBezahlen !== undefined && toPayFieldId != null) {
      byField.set(toPayFieldId, {
        field: toPayFieldId,
        value: flags.zuBezahlen,
      });
    }

    return this.patchDocument(paperlessId, {
      custom_fields: [...byField.values()],
    });
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
