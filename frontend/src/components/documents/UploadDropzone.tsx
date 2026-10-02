"use client";

import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";

import type { UploadLimits } from "@/hooks/useDocuments";

import { cx } from "../ui";

export default function UploadDropzone({
  limits,
  onFiles,
}: {
  limits: UploadLimits;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) onFiles(Array.from(event.dataTransfer.files));
  };

  const labels = [...new Set(limits.fileTypes.map((t) => (t === ".markdown" ? ".md" : t)))]
    .map((t) => t.slice(1).toUpperCase())
    .join(", ");

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload documents"
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cx(
        "group flex cursor-pointer flex-col items-center rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
        dragging ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent/60 hover:bg-surface-2",
      )}
    >
      <span
        className={cx(
          "grid size-9 place-items-center rounded-lg border bg-surface transition-colors",
          dragging ? "border-accent text-accent" : "border-border text-muted group-hover:text-accent",
        )}
      >
        <Upload className="size-4" />
      </span>
      <p className="mt-2.5 text-sm font-medium">
        {dragging ? "Drop to upload" : "Upload document"}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Drag & drop or <span className="text-accent">browse</span> · {labels} · max {limits.maxMb} MB
      </p>
      <input
        ref={input}
        type="file"
        multiple
        accept={limits.fileTypes.join(",")}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}
