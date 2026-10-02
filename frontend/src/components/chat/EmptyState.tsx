import { ArrowRight, Cpu, FileUp, MessageSquareText, Quote } from "lucide-react";

import type { RagDocument } from "@/lib/types";

import { Logo, cx } from "../ui";

const STEPS = [
  { icon: FileUp, title: "Upload", text: "PDF, Markdown or text" },
  { icon: Cpu, title: "Index", text: "Chunked & embedded" },
  { icon: MessageSquareText, title: "Ask", text: "Search finds passages" },
  { icon: Quote, title: "Answer", text: "Grounded, with sources" },
];

export default function EmptyState({
  documents,
  loading,
  onAsk,
  onOpenDocuments,
}: {
  documents: RagDocument[];
  loading: boolean;
  onAsk: (text: string) => void;
  onOpenDocuments: () => void;
}) {
  const ready = documents.filter((d) => d.status === "ready");
  const processing = documents.some((d) => d.status === "processing");
  // Which step of the pipeline the user is at.
  const current = ready.length ? 2 : processing ? 1 : 0;

  const suggestions = ready.length
    ? [
        `Summarize the key points of ${ready[0].name}`,
        "What deadlines or dates are mentioned?",
        "List any requirements or obligations described",
      ]
    : [];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-5 py-12 animate-fade-up">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-border bg-surface shadow-soft">
        <Logo className="size-7" />
      </div>
      <h2 className="mt-5 text-center text-2xl font-semibold tracking-tight text-balance">
        {ready.length ? "What would you like to know?" : "Chat with your documents"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted text-balance">
        {ready.length
          ? `Answers come only from your ${ready.length} indexed ${ready.length === 1 ? "document" : "documents"}, with the passages they're based on.`
          : "Upload a document and ask questions about it. Every answer cites the passages it was built from."}
      </p>

      <ol className="mt-9 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, text }, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li
              key={title}
              className={cx(
                "relative rounded-xl border px-3 py-3 transition-colors",
                active ? "border-accent/40 bg-accent-soft" : "border-border bg-surface",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cx(
                    "grid size-6 place-items-center rounded-md text-[11px] font-semibold",
                    active ? "bg-accent text-accent-fg" : done ? "bg-success-soft text-success" : "bg-surface-2 text-muted",
                  )}
                >
                  {index + 1}
                </span>
                <Icon className={cx("size-4", active ? "text-accent" : "text-muted")} />
              </div>
              <p className="mt-2 text-sm font-medium">{title}</p>
              <p className="text-xs text-muted">{text}</p>
            </li>
          );
        })}
      </ol>

      {!loading && !ready.length && (
        <button
          onClick={onOpenDocuments}
          className="mx-auto mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline lg:hidden"
        >
          Upload your first document <ArrowRight className="size-4" />
        </button>
      )}
      {!loading && !ready.length && (
        <p className="mt-6 hidden text-center text-sm text-muted lg:block">
          {processing ? "Your document is being processed…" : "Start by uploading a document in the sidebar."}
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="mt-8 space-y-2">
          {suggestions.map((text) => (
            <button
              key={text}
              onClick={() => onAsk(text)}
              className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm text-fg-2 transition-colors hover:border-border-strong hover:text-fg"
            >
              <span className="truncate">{text}</span>
              <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
