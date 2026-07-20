export class TriliumError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TriliumError";
    this.status = status;
  }
}

export type TriliumNote = {
  noteId: string;
  title: string;
  type?: string;
  dateModified?: string;
};

export type TriliumSearchResponse = {
  results: TriliumNote[];
};

export type TriliumAppInfo = {
  appVersion?: string;
  utcDateTime?: string;
};

export type TriliumSearchOptions = {
  ancestorNoteId?: string;
  limit?: number;
  fastSearch?: boolean;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

function normalizeToken(token: string): string {
  return token.trim().replace(/^(Bearer|Token)\s+/i, "").trim();
}

export class TriliumClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = normalizeToken(token);
  }

  noteUrl(noteId: string): string {
    return `${this.baseUrl}/#root/${noteId}`;
  }

  private headers(accept = "application/json"): HeadersInit {
    return {
      Authorization: this.token,
      Accept: accept,
    };
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { accept?: string }
  ): Promise<T> {
    if (!this.token) {
      throw new TriliumError(
        "Kein ETAPI-Token vorhanden. Bitte Token speichern und erneut testen.",
        401
      );
    }

    const url = `${this.baseUrl}/etapi${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        ...this.headers(init?.accept),
        ...(init?.headers || {}),
      },
      redirect: "follow",
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { message?: string };
        if (body.message) detail = body.message;
      } catch {
        /* ignore */
      }
      throw new TriliumError(
        `Trilium-Anfrage fehlgeschlagen (${response.status}): ${detail}`,
        response.status
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    return (await response.text()) as T;
  }

  async testConnection(): Promise<TriliumAppInfo> {
    return this.request<TriliumAppInfo>("/app-info");
  }

  async searchNotes(
    search: string,
    options: TriliumSearchOptions = {}
  ): Promise<TriliumSearchResponse> {
    const params = new URLSearchParams({ search });
    if (options.ancestorNoteId) {
      params.set("ancestorNoteId", options.ancestorNoteId);
    }
    if (options.limit != null) {
      params.set("limit", String(options.limit));
    }
    if (options.fastSearch != null) {
      params.set("fastSearch", String(options.fastSearch));
    }
    return this.request<TriliumSearchResponse>(`/notes?${params.toString()}`);
  }

  async getNoteContent(noteId: string): Promise<string> {
    return this.request<string>(`/notes/${encodeURIComponent(noteId)}/content`, {
      accept: "text/html",
    });
  }
}
