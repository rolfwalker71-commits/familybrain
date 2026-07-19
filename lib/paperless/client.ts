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
}
