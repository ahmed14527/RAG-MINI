import { createSSEParser } from "./sse";
import type { ChatTurn, Health, RagDocument, RetrievalMeta, Source, User } from "./types";

/** An API failure with a message that is safe and useful to show to users. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public details: string,
    public body?: Record<string, unknown>,
  ) {
    super(details || title);
  }
}

interface Session {
  access: string;
  refresh: string;
  user: User;
}

const SESSION_KEY = "rag.session";

/** Flatten DRF-style error details ({field: [msgs]}) into one readable sentence. */
export function describeDetails(details: unknown): string {
  if (details == null) return "";
  if (typeof details === "string") return details;
  if (Array.isArray(details)) return details.map(describeDetails).filter(Boolean).join(" ");
  if (typeof details === "object") {
    return Object.entries(details as Record<string, unknown>)
      .map(([field, value]) => {
        const text = describeDetails(value);
        return field === "non_field_errors" || field === "detail" ? text : `${humanize(field)}: ${text}`;
      })
      .join(" ");
  }
  return String(details);
}

function humanize(field: string) {
  return field.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: Record<string, unknown> | undefined;
  try {
    body = await response.json();
  } catch {
    /* non-JSON error page */
  }
  const title = typeof body?.error === "string" ? body.error : `Request failed (${response.status})`;
  const details = describeDetails(body?.details) || "Something went wrong. Please try again.";
  return new ApiError(response.status, title, details, body);
}

export interface StreamHandlers {
  onSources(payload: { sources: Source[]; grounded: boolean; retrieval: RetrievalMeta }): void;
  onDelta(text: string): void;
  onDone(payload: { cited: number[]; generation_ms: number }): void;
}

export interface ChatRequest {
  message: string;
  history: ChatTurn[];
  document_ids: number[];
}

export class ApiClient {
  private session: Session | null = null;
  private refreshing: Promise<boolean> | null = null;
  private listeners = new Set<(user: User | null, expired: boolean) => void>();

  constructor(public readonly baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(SESSION_KEY);
        this.session = stored ? JSON.parse(stored) : null;
      } catch {
        this.session = null;
      }
    }
  }

  /** Be notified on login/logout/expiry. Returns an unsubscribe function. */
  subscribe(listener: (user: User | null, expired: boolean) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get user(): User | null {
    return this.session?.user ?? null;
  }

  private setSession(session: Session | null, expired = false) {
    this.session = session;
    try {
      if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable: session lives in memory only */
    }
    this.listeners.forEach((listener) => listener(session?.user ?? null, expired));
  }

  private networkError() {
    return new ApiError(
      0,
      "Can't reach the server",
      `The API at ${this.baseUrl} is not responding. Check that the backend is running.`,
    );
  }

  private async fetchRaw(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
    const send = () => {
      const headers = new Headers(init.headers);
      if (auth && this.session) headers.set("Authorization", `Bearer ${this.session.access}`);
      return fetch(`${this.baseUrl}${path}`, { ...init, headers });
    };

    let response: Response;
    try {
      response = await send();
      if (response.status === 401 && auth && this.session && (await this.refreshAccess())) {
        response = await send();
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      throw this.networkError();
    }
    if (response.status === 401 && auth && this.session) this.setSession(null, true);
    return response;
  }

  private async request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const response = await this.fetchRaw(path, init, auth);
    if (!response.ok) throw await toApiError(response);
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  private json(body: unknown): RequestInit {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }

  /** Exchange the refresh token for a new access token (deduplicated). */
  private refreshAccess(): Promise<boolean> {
    if (!this.session) return Promise.resolve(false);
    this.refreshing ??= (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/api/v1/account/token/refresh/`, {
          ...this.json({ refresh: this.session!.refresh }),
        });
        if (!response.ok) return false;
        const { access } = await response.json();
        this.setSession({ ...this.session!, access });
        return true;
      } catch {
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  // ---- auth ----------------------------------------------------------------

  async login(username: string, password: string) {
    const res = await this.request<{ data: { user: User; tokens: { access: string; refresh: string } } }>(
      "/api/v1/account/login/", this.json({ username, password }), false,
    );
    this.setSession({ ...res.data.tokens, user: res.data.user });
  }

  async register(form: { username: string; email: string; password: string; confirm_password: string }) {
    const res = await this.request<{ data: { user: User; tokens: { access: string; refresh: string } } }>(
      "/api/v1/account/register/", this.json(form), false,
    );
    this.setSession({ ...res.data.tokens, user: res.data.user });
  }

  logout() {
    this.setSession(null);
  }

  // ---- system & documents --------------------------------------------------

  health() {
    return this.request<Health>("/api/v1/health/", {}, false);
  }

  async listDocuments() {
    return (await this.request<{ data: RagDocument[] }>("/api/v1/documents/")).data;
  }

  async deleteDocument(id: number) {
    await this.request<void>(`/api/v1/documents/${id}/`, { method: "DELETE" });
  }

  async reindexDocument(id: number) {
    return (await this.request<{ data: RagDocument }>(`/api/v1/documents/${id}/reindex/`, { method: "POST" })).data;
  }

  /** Upload with progress reporting (fetch can't report upload progress). */
  async uploadDocument(file: File, onProgress: (fraction: number) => void): Promise<RagDocument> {
    const attempt = () =>
      new Promise<{ status: number; body: Record<string, unknown> | null }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${this.baseUrl}/api/v1/documents/upload/`);
        if (this.session) xhr.setRequestHeader("Authorization", `Bearer ${this.session.access}`);
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
        xhr.onload = () => {
          let body = null;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            /* non-JSON */
          }
          resolve({ status: xhr.status, body });
        };
        xhr.onerror = () => reject(this.networkError());
        const form = new FormData();
        form.append("file", file);
        xhr.send(form);
      });

    let result = await attempt();
    if (result.status === 401 && (await this.refreshAccess())) result = await attempt();
    if (result.status === 401 && this.session) this.setSession(null, true);

    if (result.status >= 200 && result.status < 300) {
      return (result.body as { data: RagDocument }).data;
    }
    const body = result.body ?? {};
    throw new ApiError(
      result.status,
      typeof body.error === "string" ? body.error : `Upload failed (${result.status})`,
      describeDetails(body.details) || "The upload failed. Please try again.",
      body,
    );
  }

  /** Open the original file in a new tab, at `page` for PDFs. */
  async openDocument(id: number, page?: number | null) {
    // Open the tab synchronously so popup blockers allow it.
    const tab = window.open("", "_blank");
    try {
      const response = await this.fetchRaw(`/api/v1/documents/${id}/file/`);
      if (!response.ok) throw await toApiError(response);
      const url = URL.createObjectURL(await response.blob());
      const target = page ? `${url}#page=${page}` : url;
      if (tab) tab.location.href = target;
      else window.open(target, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      throw error;
    }
  }

  // ---- chat ----------------------------------------------------------------

  /** Stream an answer over SSE. Resolves when the stream ends. */
  async streamChat(request: ChatRequest, handlers: StreamHandlers, signal?: AbortSignal) {
    const response = await this.fetchRaw("/api/v1/chat/stream/", { ...this.json(request), signal });
    if (!response.ok) throw await toApiError(response);
    if (!response.body) throw new ApiError(0, "Streaming unsupported", "This browser cannot read streamed responses.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const feed = createSSEParser();
    let finished = false;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const { event, data } of feed(decoder.decode(value, { stream: true }))) {
          if (event === "sources") handlers.onSources(data as Parameters<StreamHandlers["onSources"]>[0]);
          else if (event === "delta") handlers.onDelta((data as { text: string }).text);
          else if (event === "done") {
            finished = true;
            handlers.onDone(data as Parameters<StreamHandlers["onDone"]>[0]);
          } else if (event === "error") {
            const err = data as { error: string; details: string };
            throw new ApiError(502, err.error, describeDetails(err.details));
          }
        }
      }
    } catch (error) {
      if (error instanceof ApiError || (error as Error).name === "AbortError") throw error;
      throw new ApiError(0, "Connection lost", "The connection to the server dropped while the answer was streaming.");
    }
    if (!finished) {
      throw new ApiError(0, "Incomplete answer", "The server closed the stream before the answer finished.");
    }
  }
}
