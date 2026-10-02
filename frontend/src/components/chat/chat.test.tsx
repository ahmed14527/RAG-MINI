import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "@/lib/api";
import type { ChatMessage, Source } from "@/lib/types";

import MessageItem from "./MessageItem";
import SourceList from "./SourceList";

const api = new ApiClient("http://api");

const source = (id: number, overrides: Partial<Source> = {}): Source => ({
  id,
  document_id: 7,
  document: "policy.pdf",
  chunk_id: `doc7-chunk${id}`,
  score: 0.42,
  snippet: `Passage ${id} text`,
  page: id + 2,
  section: null,
  cited: false,
  ...overrides,
});

describe("SourceList", () => {
  it("shows cited sources and collapses the uncited ones", () => {
    render(
      <SourceList api={api} messageId="m1" sources={[source(1, { cited: true }), source(2)]} activeId={null} onActivate={() => {}} />,
    );

    expect(screen.getByText("Page 3")).toBeInTheDocument();
    expect(screen.queryByText("Page 4")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /1 more retrieved passage not cited/ }));
    expect(screen.getByText("Page 4")).toBeInTheDocument();
  });

  it("expands a source to show its snippet", () => {
    const onActivate = vi.fn();
    const { rerender } = render(
      <SourceList api={api} messageId="m1" sources={[source(1, { cited: true })]} activeId={null} onActivate={onActivate} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /policy\.pdf/ }));
    expect(onActivate).toHaveBeenCalledWith(1);

    rerender(<SourceList api={api} messageId="m1" sources={[source(1, { cited: true })]} activeId={1} onActivate={onActivate} />);
    expect(screen.getByText("Passage 1 text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open page 3" })).toBeInTheDocument();
  });

  it("says so when nothing relevant was found", () => {
    render(<SourceList api={api} messageId="m1" sources={[]} activeId={null} onActivate={() => {}} />);
    expect(screen.getByText(/No matching passages/)).toBeInTheDocument();
  });
});

describe("MessageItem", () => {
  const assistant = (overrides: Partial<ChatMessage>): ChatMessage => ({
    id: "a1",
    role: "assistant",
    content: "",
    status: "done",
    ...overrides,
  });

  it("renders markdown with clickable citation badges", () => {
    render(
      <MessageItem
        api={api}
        isLast
        onRetry={() => {}}
        message={assistant({ content: "Refunds take **30 days** [1].", sources: [source(1, { cited: true })] })}
      />,
    );

    expect(screen.getByText("30 days").tagName).toBe("STRONG");
    fireEvent.click(screen.getByRole("button", { name: "Show source 1" }));
    expect(screen.getByText("Passage 1 text")).toBeInTheDocument();
  });

  it("shows a readable error with a retry action", () => {
    const onRetry = vi.fn();
    render(
      <MessageItem
        api={api}
        isLast
        onRetry={onRetry}
        message={assistant({ status: "error", error: { title: "Can't reach the server", details: "The API is not responding." } })}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the server");
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows the retrieval phase while waiting", () => {
    render(<MessageItem api={api} isLast onRetry={() => {}} message={assistant({ status: "pending", phase: "retrieving" })} />);
    expect(screen.getByText("Searching your documents…")).toBeInTheDocument();
  });
});
