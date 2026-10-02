import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiClient, ApiError } from "@/lib/api";
import type { RagDocument } from "@/lib/types";

import { useDocuments } from "./useDocuments";

const limits = { fileTypes: [".pdf", ".txt", ".md"], maxMb: 1 };

const doc: RagDocument = {
  id: 1, name: "a.pdf", file_type: "pdf", file_size: 10, status: "ready", error: "",
  chunk_count: 2, page_count: 1, uploaded_at: new Date().toISOString(),
};

function setup(overrides: Partial<ApiClient> = {}) {
  const api = Object.assign(new ApiClient("http://api"), {
    listDocuments: vi.fn().mockResolvedValue([]),
    uploadDocument: vi.fn().mockResolvedValue(doc),
    ...overrides,
  });
  const hook = renderHook(() => useDocuments(api, limits));
  return { api, ...hook };
}

describe("useDocuments", () => {
  it("rejects unsupported and oversized files without calling the API", async () => {
    const { api, result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() =>
      result.current.upload([
        new File(["x"], "sheet.xlsx"),
        new File([new Uint8Array(2 * 1024 * 1024)], "big.pdf"),
      ]),
    );

    expect(api.uploadDocument).not.toHaveBeenCalled();
    expect(result.current.uploads.map((u) => u.error?.details)).toEqual([
      expect.stringContaining(".xlsx isn't supported"),
      expect.stringContaining("the limit is 1 MB"),
    ]);
  });

  it("adds an uploaded document to the list", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.upload([new File(["%PDF"], "a.pdf")]));

    expect(result.current.documents).toEqual([doc]);
    expect(result.current.uploads).toEqual([]);
  });

  it("keeps a server-side upload error visible", async () => {
    const { result } = setup({
      uploadDocument: vi.fn().mockRejectedValue(new ApiError(422, "Document processing failed", "No readable text was found.")),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.upload([new File(["%PDF"], "scan.pdf")]));

    expect(result.current.uploads[0]).toMatchObject({
      phase: "error",
      error: { title: "Document processing failed", details: "No readable text was found." },
    });
  });
});
