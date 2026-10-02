"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiClient, ApiError } from "@/lib/api";
import type { ChatMessage, ChatTurn } from "@/lib/types";

const HISTORY_TURNS = 6;

function storageKey(username: string) {
  return `rag.chat.${username}`;
}

function loadMessages(username: string): ChatMessage[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey(username));
    const messages: ChatMessage[] = raw ? JSON.parse(raw) : [];
    // A reload interrupts any in-flight answer.
    return messages.map((m) =>
      m.status === "streaming" || m.status === "pending" ? { ...m, status: "stopped", phase: undefined } : m,
    );
  } catch {
    return [];
  }
}

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Conversation state for the current browser session. */
export function useChat(api: ApiClient, username: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Restore from sessionStorage after mount (not available during SSR).
    setMessages(loadMessages(username));
    setHydrated(true);
  }, [username]);

  const busy = messages.some((m) => m.status === "pending" || m.status === "streaming");

  // Persist completed conversation state (skip while streaming to avoid churn).
  useEffect(() => {
    if (!hydrated || busy) return;
    try {
      window.sessionStorage.setItem(storageKey(username), JSON.stringify(messages));
    } catch {
      /* storage full/unavailable */
    }
  }, [messages, busy, hydrated, username]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const update = (id: string, patch: (m: ChatMessage) => Partial<ChatMessage>) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...patch(m) } : m)));

  /** Ask `text`, using `base` (the conversation before this question) as history. */
  const ask = useCallback(
    async (text: string, documentIds: number[], base: ChatMessage[]) => {
      const message = text.trim();
      if (!message) return;

      const history: ChatTurn[] = base
        .filter((m) => m.status === "done" && m.content)
        .slice(-HISTORY_TURNS)
        .map(({ role, content }) => ({ role, content }));

      const userMsg: ChatMessage = { id: newId(), role: "user", content: message, status: "done" };
      const assistantId = newId();
      setMessages((list) => [
        ...list,
        userMsg,
        { id: assistantId, role: "assistant", content: "", status: "pending", phase: "retrieving" },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await api.streamChat(
          { message, history, document_ids: documentIds },
          {
            onSources: ({ sources, grounded, retrieval }) =>
              update(assistantId, () => ({ sources, grounded, retrieval, phase: "generating", status: "streaming" })),
            onDelta: (delta) => update(assistantId, (m) => ({ content: m.content + delta })),
            onDone: ({ cited, generation_ms }) =>
              update(assistantId, (m) => ({
                status: "done",
                phase: undefined,
                generationMs: generation_ms,
                sources: m.sources?.map((s) => ({ ...s, cited: cited.includes(s.id) })),
              })),
          },
          controller.signal,
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          update(assistantId, () => ({ status: "stopped", phase: undefined }));
        } else {
          const err = error as ApiError;
          update(assistantId, () => ({
            status: "error",
            phase: undefined,
            error: { title: err.title ?? "Error", details: err.details ?? String(error) },
          }));
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [api],
  );

  const send = useCallback(
    (text: string, documentIds: number[] = []) => {
      if (!busy) return ask(text, documentIds, messages);
    },
    [ask, busy, messages],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** Re-ask the question that produced the assistant message `id`. */
  const retry = useCallback(
    (id: string, documentIds: number[] = []) => {
      const index = messages.findIndex((m) => m.id === id);
      const question = messages[index - 1];
      if (busy || index < 1 || question?.role !== "user") return;
      const base = messages.slice(0, index - 1);
      setMessages(base);
      ask(question.content, documentIds, base);
    },
    [ask, busy, messages],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  return { messages, busy, send, stop, retry, clear };
}
