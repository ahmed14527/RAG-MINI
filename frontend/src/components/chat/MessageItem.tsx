"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, Copy, RotateCw } from "lucide-react";

import { ApiClient } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

import { Button, Logo, cx } from "../ui";
import Markdown from "./Markdown";
import SourceList from "./SourceList";

export default function MessageItem({
  api,
  message,
  isLast,
  onRetry,
}: {
  api: ApiClient;
  message: ChatMessage;
  isLast: boolean;
  onRetry: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-3 px-4 py-2.5 text-[15px] leading-relaxed text-fg">
          {message.content}
        </div>
      </div>
    );
  }
  return <AssistantMessage api={api} message={message} isLast={isLast} onRetry={onRetry} />;
}

function AssistantMessage({
  api,
  message,
  isLast,
  onRetry,
}: {
  api: ApiClient;
  message: ChatMessage;
  isLast: boolean;
  onRetry: () => void;
}) {
  const [activeSource, setActiveSource] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const sources = useMemo(() => message.sources ?? [], [message.sources]);
  const sourceIds = useMemo(() => sources.map((s) => s.id), [sources]);
  const streaming = message.status === "streaming";
  const working = message.status === "pending" || (streaming && !message.content);
  const finished = message.status === "done" || message.status === "stopped";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex gap-3.5 animate-fade-up">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-surface">
        <Logo className="size-4" />
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        {working && (
          <p className="shimmer-text pt-1 text-sm font-medium" aria-live="polite">
            {message.phase === "retrieving"
              ? "Searching your documents…"
              : `Found ${sources.length} relevant ${sources.length === 1 ? "passage" : "passages"} · writing answer…`}
          </p>
        )}

        {message.content && (
          <div className={cx(streaming && "streaming-caret")}>
            <Markdown content={message.content} sourceIds={sourceIds} onCite={setActiveSource} />
          </div>
        )}

        {message.status === "error" && message.error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-fg">{message.error.title}</p>
              <p className="mt-0.5 text-fg-2">{message.error.details}</p>
            </div>
            {isLast && (
              <Button size="sm" onClick={onRetry}>
                <RotateCw className="size-3.5" /> Retry
              </Button>
            )}
          </div>
        )}

        {message.status === "stopped" && (
          <p className="text-xs text-muted">
            Generation stopped.
            {isLast && (
              <button onClick={onRetry} className="ml-1.5 font-medium text-accent hover:underline">
                Regenerate
              </button>
            )}
          </p>
        )}

        {(finished || (streaming && message.content)) && message.sources && (
          <SourceList
            api={api}
            messageId={message.id}
            sources={sources}
            retrieval={message.retrieval}
            activeId={activeSource}
            onActivate={setActiveSource}
          />
        )}

        {message.status === "done" && (
          <div className="-ml-1.5 flex items-center gap-1 text-muted">
            <Button size="sm" variant="ghost" onClick={copy} aria-label="Copy answer">
              {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            {message.generationMs != null && message.grounded && (
              <span className="text-[11px] tabular-nums">Answered in {(message.generationMs / 1000).toFixed(1)}s</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
