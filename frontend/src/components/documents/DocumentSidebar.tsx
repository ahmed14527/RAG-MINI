"use client";

import { LogOut, Moon, RefreshCw, Sun, X } from "lucide-react";

import type { useDocuments, UploadLimits } from "@/hooks/useDocuments";
import { useTheme } from "@/hooks/useTheme";
import { ApiClient } from "@/lib/api";
import type { User } from "@/lib/types";

import { Button, Logo, Spinner } from "../ui";
import DocumentItem from "./DocumentItem";
import UploadDropzone from "./UploadDropzone";
import UploadItemRow from "./UploadItemRow";

export default function DocumentSidebar({
  api,
  user,
  docs,
  limits,
  selected,
  onToggleSelected,
  onClearSelected,
  onClose,
}: {
  api: ApiClient;
  user: User;
  docs: ReturnType<typeof useDocuments>;
  limits: UploadLimits;
  selected: Set<number>;
  onToggleSelected: (id: number) => void;
  onClearSelected: () => void;
  onClose: () => void;
}) {
  const { theme, toggle } = useTheme();
  const readyCount = docs.documents.filter((d) => d.status === "ready").length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <Logo className="size-6" />
        <span className="flex-1 text-[15px] font-semibold tracking-tight">Mini RAG</span>
        <Button size="icon" variant="ghost" className="lg:hidden" aria-label="Close documents" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="px-3 pb-3">
        <UploadDropzone limits={limits} onFiles={docs.upload} />
      </div>

      <div className="flex items-center justify-between px-4 pb-1.5 pt-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          Documents{docs.documents.length > 0 && <span className="ml-1.5 tabular-nums">{docs.documents.length}</span>}
        </h2>
        {selected.size > 0 ? (
          <button className="text-xs font-medium text-accent hover:underline" onClick={onClearSelected}>
            Clear selection
          </button>
        ) : (
          readyCount > 1 && <span className="text-[11px] text-muted">Select to focus chat</span>
        )}
      </div>

      <div className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {docs.uploads.map((item) => (
          <UploadItemRow key={item.key} item={item} onDismiss={() => docs.dismissUpload(item.key)} />
        ))}

        {docs.loading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted">
            <Spinner /> Loading documents…
          </div>
        ) : docs.loadError ? (
          <div className="px-2 py-4 text-sm">
            <p className="text-danger">{docs.loadError.details}</p>
            <Button size="sm" className="mt-2" onClick={docs.refresh}>
              <RefreshCw className="size-3.5" /> Try again
            </Button>
          </div>
        ) : docs.documents.length === 0 && docs.uploads.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">No documents yet.</p>
        ) : (
          docs.documents.map((doc) => (
            <DocumentItem
              key={doc.id}
              api={api}
              doc={doc}
              busy={docs.busyIds.has(doc.id)}
              selected={selected.has(doc.id)}
              onToggleSelected={() => onToggleSelected(doc.id)}
              onDelete={() => docs.remove(doc.id)}
              onReindex={() => docs.reindex(doc.id)}
            />
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold uppercase text-accent">
          {user.username.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.username}</p>
          {user.email && <p className="truncate text-xs text-muted">{user.email}</p>}
        </div>
        <Button size="icon" variant="ghost" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={toggle}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <Button size="icon" variant="ghost" aria-label="Sign out" title="Sign out" onClick={() => api.logout()}>
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  );
}
