"use client";

import { useState } from "react";
import { Check, ExternalLink, FileText, FileType2, RotateCw, Trash2 } from "lucide-react";

import { ApiClient, ApiError } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import type { RagDocument } from "@/lib/types";

import { Button, Spinner, cx } from "../ui";

export default function DocumentItem({
  api,
  doc,
  busy,
  selected,
  onToggleSelected,
  onDelete,
  onReindex,
}: {
  api: ApiClient;
  doc: RagDocument;
  busy: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onDelete: () => Promise<void>;
  onReindex: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const ready = doc.status === "ready";
  const Icon = doc.file_type === "pdf" ? FileText : FileType2;

  const run = async (action: () => Promise<void>) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError((error as ApiError).details);
    }
  };

  const meta = [
    doc.file_type.toUpperCase(),
    doc.page_count ? `${doc.page_count} ${doc.page_count === 1 ? "page" : "pages"}` : null,
    ready ? `${doc.chunk_count} chunks` : null,
    formatBytes(doc.file_size),
  ].filter(Boolean);

  return (
    <div
      className={cx(
        "group relative rounded-lg border px-2.5 py-2 transition-colors animate-fade-in",
        selected ? "border-accent/40 bg-accent-soft" : "border-transparent hover:bg-surface-2",
      )}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          disabled={!ready}
          onClick={onToggleSelected}
          aria-pressed={selected}
          aria-label={selected ? `Remove ${doc.name} from chat focus` : `Focus chat on ${doc.name}`}
          title={ready ? (selected ? "Searching this document" : "Focus chat on this document") : undefined}
          className={cx(
            "relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border transition-colors",
            selected ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-muted",
            ready && !selected && "hover:border-accent/50 hover:text-accent",
          )}
        >
          {selected ? <Check className="size-4" /> : <Icon className="size-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-5" title={doc.name}>
            {doc.name}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted">{meta.join(" · ")}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px]">
            <StatusBadge status={doc.status} />
            <span className="text-muted">· {formatDate(doc.uploaded_at)}</span>
          </div>
        </div>

        <div
          className={cx(
            "flex shrink-0 items-center transition-opacity",
            confirming || busy ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100",
          )}
        >
          {busy ? (
            <Spinner className="m-2 size-3.5 text-muted" />
          ) : (
            !confirming && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Open ${doc.name}`}
                  title="Open file"
                  onClick={() => run(() => api.openDocument(doc.id))}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 hover:text-danger"
                  aria-label={`Delete ${doc.name}`}
                  title="Delete"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )
          )}
        </div>
      </div>

      {doc.status === "failed" && (
        <div className="mt-2 rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-fg-2">
          {doc.error || "Processing failed."}
          <button
            className="ml-1.5 inline-flex items-center gap-1 font-medium text-danger hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={() => run(onReindex)}
          >
            <RotateCw className="size-3" /> Retry
          </button>
        </div>
      )}

      {confirming && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs animate-fade-in">
          <span className="flex-1 text-fg-2">Delete this document and its index?</span>
          <Button size="sm" variant="ghost" className="h-6" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            className="h-6"
            onClick={() => {
              setConfirming(false);
              run(onDelete);
            }}
          >
            Delete
          </Button>
        </div>
      )}

      {actionError && <p className="mt-1.5 text-xs text-danger">{actionError}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: RagDocument["status"] }) {
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-warning">
        <Spinner className="size-3" /> Processing
      </span>
    );
  }
  return (
    <span className={cx("inline-flex items-center gap-1.5 font-medium", status === "ready" ? "text-success" : "text-danger")}>
      <span className={cx("size-1.5 rounded-full", status === "ready" ? "bg-success" : "bg-danger")} />
      {status === "ready" ? "Ready" : "Failed"}
    </span>
  );
}
