"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiClient, ApiError } from "@/lib/api";
import { fileExtension, formatBytes } from "@/lib/format";
import type { RagDocument } from "@/lib/types";

export interface UploadItem {
  key: string;
  name: string;
  size: number;
  progress: number; // 0..1 of the file transfer
  phase: "uploading" | "processing" | "error";
  error?: { title: string; details: string };
}

export interface UploadLimits {
  fileTypes: string[];
  maxMb: number;
}

const POLL_MS = 3000;

export function useDocuments(api: ApiClient, limits: UploadLimits) {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const docs = await api.listDocuments();
      if (!mounted.current) return;
      setDocuments(docs);
      setLoadError(null);
    } catch (error) {
      if (mounted.current) setLoadError(error as ApiError);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // Poll while something is processing server-side (e.g. a re-index from another tab).
  const anyProcessing = documents.some((d) => d.status === "processing");
  useEffect(() => {
    if (!anyProcessing) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [anyProcessing, refresh]);

  const patchUpload = (key: string, patch: Partial<UploadItem>) =>
    setUploads((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const validate = useCallback(
    (file: File): string | null => {
      const ext = fileExtension(file.name);
      if (!limits.fileTypes.includes(ext)) {
        return `${ext || "This file type"} isn't supported. Upload ${limits.fileTypes.join(", ")} files.`;
      }
      if (file.size > limits.maxMb * 1024 * 1024) {
        return `File is ${formatBytes(file.size)}; the limit is ${limits.maxMb} MB.`;
      }
      if (file.size === 0) return "The file is empty.";
      return null;
    },
    [limits],
  );

  const uploadOne = useCallback(
    async (file: File) => {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      const invalid = validate(file);
      setUploads((items) => [
        ...items,
        {
          key,
          name: file.name,
          size: file.size,
          progress: 0,
          phase: invalid ? "error" : "uploading",
          error: invalid ? { title: "Can't upload this file", details: invalid } : undefined,
        },
      ]);
      if (invalid) return;

      try {
        const doc = await api.uploadDocument(file, (fraction) =>
          patchUpload(key, fraction >= 1 ? { progress: 1, phase: "processing" } : { progress: fraction }),
        );
        setDocuments((docs) => [doc, ...docs.filter((d) => d.id !== doc.id)]);
        setUploads((items) => items.filter((item) => item.key !== key));
      } catch (error) {
        const err = error as ApiError;
        patchUpload(key, { phase: "error", error: { title: err.title, details: err.details } });
        // A provider failure keeps the document (as failed) server-side; show it.
        if (err.body?.document) refresh();
      }
    },
    [api, refresh, validate],
  );

  const upload = useCallback((files: FileList | File[]) => {
    // Sequential: keeps server load and provider rate limits predictable.
    return Array.from(files).reduce((chain, file) => chain.then(() => uploadOne(file)), Promise.resolve());
  }, [uploadOne]);

  const dismissUpload = (key: string) => setUploads((items) => items.filter((item) => item.key !== key));

  const withBusy = async (id: number, action: () => Promise<void>) => {
    setBusyIds((ids) => new Set(ids).add(id));
    try {
      await action();
    } finally {
      setBusyIds((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  };

  const remove = (id: number) =>
    withBusy(id, async () => {
      await api.deleteDocument(id);
      setDocuments((docs) => docs.filter((d) => d.id !== id));
    });

  const reindex = (id: number) =>
    withBusy(id, async () => {
      setDocuments((docs) => docs.map((d) => (d.id === id ? { ...d, status: "processing", error: "" } : d)));
      try {
        const doc = await api.reindexDocument(id);
        setDocuments((docs) => docs.map((d) => (d.id === id ? doc : d)));
      } finally {
        refresh();
      }
    });

  return { documents, loading, loadError, uploads, busyIds, refresh, upload, dismissUpload, remove, reindex };
}
