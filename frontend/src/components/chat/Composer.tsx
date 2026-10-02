"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Files, Square, X } from "lucide-react";

import type { RagDocument } from "@/lib/types";

import { cx } from "../ui";

export default function Composer({
  busy,
  disabled,
  disabledHint,
  selectedDocs,
  totalReady,
  onClearSelected,
  onSend,
  onStop,
}: {
  busy: boolean;
  disabled: boolean;
  disabledHint: string;
  selectedDocs: RagDocument[];
  totalReady: number;
  onClearSelected: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to a max height.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const canSend = !disabled && !busy && text.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="shrink-0 px-3 pb-3 pt-1 sm:px-6 sm:pb-5">
      <div className="mx-auto w-full max-w-3xl">
        <div
          className={cx(
            "rounded-2xl border bg-surface shadow-soft transition-colors",
            "focus-within:border-border-strong",
            disabled ? "border-border opacity-80" : "border-border",
          )}
        >
          <textarea
            ref={area}
            rows={1}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={4000}
            placeholder={disabled ? disabledHint : "Ask a question about your documents…"}
            aria-label="Message"
            className="block max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-6 text-fg placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-1">
            <div className="flex min-w-0 flex-1 items-center">
              {totalReady > 0 &&
                (selectedDocs.length ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-accent-soft py-1 pl-2 pr-1 text-xs font-medium text-accent">
                    <Files className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {selectedDocs.length === 1 ? selectedDocs[0].name : `${selectedDocs.length} documents`}
                    </span>
                    <button
                      aria-label="Search all documents"
                      onClick={onClearSelected}
                      className="rounded p-0.5 hover:bg-accent/15"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-1.5 text-xs text-muted">
                    <Files className="size-3.5" />
                    {totalReady === 1 ? "Searching 1 document" : `Searching all ${totalReady} documents`}
                  </span>
                ))}
            </div>
            {busy ? (
              <button
                onClick={onStop}
                aria-label="Stop generating"
                className="grid size-8 place-items-center rounded-lg bg-fg text-bg transition-opacity hover:opacity-85"
              >
                <Square className="size-3 fill-current" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!canSend}
                aria-label="Send message"
                className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg transition-colors hover:bg-accent-hover disabled:bg-surface-3 disabled:text-muted"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 hidden text-center text-[11px] text-muted sm:block">
          Answers are generated from your documents and may contain mistakes — check the cited sources.
        </p>
      </div>
    </div>
  );
}
