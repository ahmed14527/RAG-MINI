"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, FileText, SearchX } from "lucide-react";

import { ApiClient, ApiError } from "@/lib/api";
import { sourceLocation } from "@/lib/format";
import type { RetrievalMeta, Source } from "@/lib/types";

import { cx } from "../ui";

export default function SourceList({
  api,
  messageId,
  sources,
  retrieval,
  activeId,
  onActivate,
}: {
  api: ApiClient;
  messageId: string;
  sources: Source[];
  retrieval?: RetrievalMeta;
  activeId: number | null;
  onActivate: (id: number | null) => void;
}) {
  const cited = sources.filter((s) => s.cited);
  // If the model cited nothing, show everything that was retrieved.
  const primary = cited.length ? cited : sources;
  const others = cited.length ? sources.filter((s) => !s.cited) : [];
  const [showOthers, setShowOthers] = useState(false);
  const othersVisible = showOthers || others.some((s) => s.id === activeId);

  if (!sources.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted">
        <SearchX className="size-3.5 shrink-0" />
        No matching passages were found in your documents.
      </div>
    );
  }

  return (
    <section aria-label="Sources">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Sources</h3>
        {retrieval && (
          <p className="text-[11px] text-muted tabular-nums">
            {retrieval.used} {retrieval.used === 1 ? "passage" : "passages"} retrieved · {retrieval.latency_ms} ms
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        {primary.map((s) => (
          <SourceCard key={s.id} api={api} messageId={messageId} source={s} active={activeId === s.id} onActivate={onActivate} />
        ))}
      </div>
      {others.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowOthers((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg"
            aria-expanded={othersVisible}
          >
            <ChevronDown className={cx("size-3.5 transition-transform", othersVisible && "rotate-180")} />
            {others.length} more retrieved {others.length === 1 ? "passage" : "passages"} not cited
          </button>
          {othersVisible && (
            <div className="mt-1.5 space-y-1.5 animate-fade-in">
              {others.map((s) => (
                <SourceCard key={s.id} api={api} messageId={messageId} source={s} active={activeId === s.id} onActivate={onActivate} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SourceCard({
  api,
  messageId,
  source,
  active,
  onActivate,
}: {
  api: ApiClient;
  messageId: string;
  source: Source;
  active: boolean;
  onActivate: (id: number | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const location = sourceLocation(source);
  const relevance = Math.round(Math.max(0, Math.min(1, source.score)) * 100);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const open = async () => {
    setError(null);
    try {
      await api.openDocument(source.document_id, source.page);
    } catch (err) {
      setError((err as ApiError).details);
    }
  };

  return (
    <div
      ref={ref}
      id={`source-${messageId}-${source.id}`}
      className={cx(
        "overflow-hidden rounded-lg border transition-colors",
        active ? "border-accent/45 bg-accent-soft/60" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <button
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
        onClick={() => onActivate(active ? null : source.id)}
        aria-expanded={active}
      >
        <span
          className={cx(
            "grid h-5 min-w-5 place-items-center rounded-md px-1 text-[11px] font-semibold tabular-nums",
            source.cited ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
          )}
        >
          {source.id}
        </span>
        <FileText className="size-3.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{source.document}</span>
        {location && <span className="shrink-0 text-xs text-muted">{location}</span>}
        <span className="hidden shrink-0 items-center gap-1.5 sm:flex" title={`Similarity ${source.score.toFixed(2)}`}>
          <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-accent/70" style={{ width: `${relevance}%` }} />
          </span>
          <span className="w-7 text-right text-[11px] text-muted tabular-nums">{relevance}%</span>
        </span>
        <ChevronDown className={cx("size-3.5 shrink-0 text-muted transition-transform", active && "rotate-180")} />
      </button>
      {active && (
        <div className="border-t border-border px-3 pb-3 pt-2.5 animate-fade-in">
          {source.section && source.page != null && <p className="mb-1 text-xs text-muted">Section: {source.section}</p>}
          <blockquote className="whitespace-pre-wrap border-l-2 border-accent/40 pl-3 text-[13px] leading-relaxed text-fg-2">
            {source.snippet}
            {source.snippet.length >= 600 && "…"}
          </blockquote>
          <div className="mt-2.5 flex items-center gap-3">
            <button onClick={open} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              <ExternalLink className="size-3" />
              {source.page != null ? `Open page ${source.page}` : "Open document"}
            </button>
            <span className="font-mono text-[10px] text-muted">{source.chunk_id}</span>
          </div>
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
