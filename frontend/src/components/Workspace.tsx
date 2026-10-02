"use client";

import { useMemo, useState } from "react";
import { Menu, SquarePen } from "lucide-react";

import { useChat } from "@/hooks/useChat";
import { useDocuments } from "@/hooks/useDocuments";
import { ApiClient } from "@/lib/api";
import type { User } from "@/lib/types";

import type { HealthState } from "./App";
import ChatPanel from "./chat/ChatPanel";
import DocumentSidebar from "./documents/DocumentSidebar";
import { Banner, Button, cx } from "./ui";

const DEFAULT_LIMITS = { fileTypes: [".pdf", ".txt", ".md", ".markdown"], maxMb: 20 };

export default function Workspace({
  api,
  user,
  health,
  onRetryHealth,
}: {
  api: ApiClient;
  user: User;
  health: HealthState;
  onRetryHealth: () => void;
}) {
  const limits = useMemo(
    () =>
      health.status === "ok"
        ? { fileTypes: health.health.upload.file_types, maxMb: health.health.upload.max_mb }
        : DEFAULT_LIMITS,
    [health],
  );
  const docs = useDocuments(api, limits);
  const chat = useChat(api, user.username);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Only ready documents can be searched; drop selections that no longer apply.
  const readyIds = useMemo(
    () => new Set(docs.documents.filter((d) => d.status === "ready").map((d) => d.id)),
    [docs.documents],
  );
  const selectedIds = [...selected].filter((id) => readyIds.has(id));

  const toggleSelected = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const providerMissing =
    health.status === "ok" && (!health.health.checks.llm_configured || !health.health.checks.embeddings_configured);

  return (
    <div className="flex h-full">
      {/* Mobile backdrop */}
      <div
        className={cx(
          "fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px] transition-opacity lg:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 w-[300px] border-r border-border bg-surface transition-transform duration-200",
          "lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        )}
      >
        <DocumentSidebar
          api={api}
          user={user}
          docs={docs}
          limits={limits}
          selected={new Set(selectedIds)}
          onToggleSelected={toggleSelected}
          onClearSelected={() => setSelected(new Set())}
          onClose={() => setSidebarOpen(false)}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
          <Button size="icon" variant="ghost" className="lg:hidden" aria-label="Open documents" onClick={() => setSidebarOpen(true)}>
            <Menu className="size-[18px]" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">Chat</h1>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={chat.clear}
            disabled={!chat.messages.length}
            aria-label="Start a new chat"
            className="h-8"
          >
            <SquarePen className="size-4" />
            <span className="hidden sm:inline">New chat</span>
          </Button>
        </header>

        {(health.status === "down" || providerMissing) && (
          <div className="mx-auto w-full max-w-3xl px-4 pt-4">
            {health.status === "down" ? (
              <Banner
                tone="danger"
                title={health.error.title}
                action={<Button size="sm" variant="ghost" onClick={onRetryHealth}>Retry</Button>}
              >
                {health.error.details}
              </Banner>
            ) : (
              <Banner title="AI provider not configured">
                The server has no API key for the language/embedding model, so uploads and answers will fail. Set{" "}
                <code className="font-mono text-[0.85em]">OPENAI_API_KEY</code> in the backend environment.
              </Banner>
            )}
          </div>
        )}

        <ChatPanel
          api={api}
          chat={chat}
          documents={docs.documents}
          documentsLoading={docs.loading}
          selectedIds={selectedIds}
          onClearSelected={() => setSelected(new Set())}
          onOpenDocuments={() => setSidebarOpen(true)}
        />
      </main>
    </div>
  );
}
