"use client";

import { useEffect, useRef } from "react";

import type { useChat } from "@/hooks/useChat";
import { ApiClient } from "@/lib/api";
import type { RagDocument } from "@/lib/types";

import Composer from "./Composer";
import EmptyState from "./EmptyState";
import MessageItem from "./MessageItem";

export default function ChatPanel({
  api,
  chat,
  documents,
  documentsLoading,
  selectedIds,
  onClearSelected,
  onOpenDocuments,
}: {
  api: ApiClient;
  chat: ReturnType<typeof useChat>;
  documents: RagDocument[];
  documentsLoading: boolean;
  selectedIds: number[];
  onClearSelected: () => void;
  onOpenDocuments: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const readyDocs = documents.filter((d) => d.status === "ready");
  const selectedDocs = readyDocs.filter((d) => selectedIds.includes(d.id));

  // Follow the stream only if the user hasn't scrolled up to read.
  useEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTo({ top: el.scrollHeight });
  }, [chat.messages]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = (text: string) => {
    stickToBottom.current = true;
    chat.send(text, selectedIds);
  };

  const lastId = chat.messages.at(-1)?.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {chat.messages.length === 0 ? (
          <EmptyState
            documents={documents}
            loading={documentsLoading}
            onAsk={send}
            onOpenDocuments={onOpenDocuments}
          />
        ) : (
          <div role="log" aria-live="polite" className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-10 pt-8 sm:px-6">
            {chat.messages.map((message) => (
              <MessageItem
                key={message.id}
                api={api}
                message={message}
                isLast={message.id === lastId}
                onRetry={() => chat.retry(message.id, selectedIds)}
              />
            ))}
          </div>
        )}
      </div>

      <Composer
        busy={chat.busy}
        disabled={readyDocs.length === 0}
        disabledHint={documentsLoading ? "Loading documents…" : "Upload a document to start asking questions"}
        selectedDocs={selectedDocs}
        totalReady={readyDocs.length}
        onClearSelected={onClearSelected}
        onSend={send}
        onStop={chat.stop}
      />
    </div>
  );
}
