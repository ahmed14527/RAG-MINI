import { AlertCircle, X } from "lucide-react";

import type { UploadItem } from "@/hooks/useDocuments";
import { formatBytes } from "@/lib/format";

import { Spinner, cx } from "../ui";

export default function UploadItemRow({ item, onDismiss }: { item: UploadItem; onDismiss: () => void }) {
  const failed = item.phase === "error";

  return (
    <div
      className={cx(
        "rounded-lg border px-2.5 py-2 animate-fade-up",
        failed ? "border-danger/25 bg-danger-soft" : "border-border bg-surface-2",
      )}
    >
      <div className="flex items-center gap-2">
        {failed ? <AlertCircle className="size-4 shrink-0 text-danger" /> : <Spinner className="size-4 shrink-0 text-accent" />}
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={item.name}>
          {item.name}
        </p>
        {failed && (
          <button aria-label="Dismiss" className="rounded p-0.5 text-muted hover:text-fg" onClick={onDismiss}>
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {failed ? (
        <p className="mt-1 pl-6 text-xs text-fg-2">
          <span className="font-medium text-danger">{item.error?.title}.</span> {item.error?.details}
        </p>
      ) : (
        <div className="mt-1.5 pl-6">
          <div className="h-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className={cx(
                "h-full rounded-full bg-accent transition-[width] duration-200",
                item.phase === "processing" && "animate-pulse",
              )}
              style={{ width: `${Math.max(4, item.progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {item.phase === "uploading"
              ? `Uploading · ${Math.round(item.progress * 100)}% of ${formatBytes(item.size)}`
              : "Processing · extracting, chunking & embedding…"}
          </p>
        </div>
      )}
    </div>
  );
}
