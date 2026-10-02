export type DocumentStatus = "processing" | "ready" | "failed";

export interface RagDocument {
  id: number;
  name: string;
  file_type: "pdf" | "txt" | "md";
  file_size: number;
  status: DocumentStatus;
  error: string;
  chunk_count: number;
  page_count: number | null;
  uploaded_at: string;
}

export interface Source {
  id: number;
  document_id: number;
  document: string;
  chunk_id: string;
  score: number;
  snippet: string;
  page: number | null;
  section: string | null;
  cited: boolean;
}

export interface RetrievalMeta {
  top_k: number;
  candidates: number;
  used: number;
  min_score: number;
  latency_ms: number;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatMessage extends ChatTurn {
  id: string;
  status: "pending" | "streaming" | "done" | "error" | "stopped";
  /** Assistant only: where the pipeline currently is. */
  phase?: "retrieving" | "generating";
  sources?: Source[];
  grounded?: boolean;
  retrieval?: RetrievalMeta;
  generationMs?: number;
  error?: { title: string; details: string };
}

export interface User {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface Health {
  status: "ok" | "degraded";
  checks: {
    database: boolean;
    vector_store: boolean;
    llm_configured: boolean;
    embeddings_configured: boolean;
  };
  upload: { file_types: string[]; max_mb: number };
}
