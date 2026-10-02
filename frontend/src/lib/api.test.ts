import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient, ApiError } from "./api";

/** Stream `body` in small chunks to exercise reassembly across reads. */
function sseResponse(body: string) {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const handlers = () => ({ onSources: vi.fn(), onDelta: vi.fn(), onDone: vi.fn() });
const request = { message: "Q?", history: [], document_ids: [] };

afterEach(() => vi.unstubAllGlobals());

describe("ApiClient.streamChat", () => {
  it("dispatches sources, deltas and done", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(
      'event: sources\ndata: {"sources":[],"grounded":false,"retrieval":{}}\n\n' +
      'event: delta\ndata: {"text":"Hel"}\n\nevent: delta\ndata: {"text":"lo"}\n\n' +
      'event: done\ndata: {"cited":[],"generation_ms":5}\n\n',
    )));
    const h = handlers();

    await new ApiClient("http://api").streamChat(request, h);

    expect(h.onSources).toHaveBeenCalledOnce();
    expect(h.onDelta.mock.calls.map((c) => c[0]).join("")).toBe("Hello");
    expect(h.onDone).toHaveBeenCalledWith({ cited: [], generation_ms: 5 });
  });

  it("turns an error event into an ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(
      'event: sources\ndata: {"sources":[]}\n\nevent: error\ndata: {"error":"Language model error","details":"Provider down."}\n\n',
    )));

    await expect(new ApiClient("http://api").streamChat(request, handlers())).rejects.toMatchObject({
      title: "Language model error",
      details: "Provider down.",
    });
  });

  it("reports JSON errors returned before streaming starts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "AI provider not configured", details: "Set OPENAI_API_KEY." }), { status: 503 }),
    ));

    const error = await new ApiClient("http://api").streamChat(request, handlers()).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, title: "AI provider not configured" });
  });

  it("reports an unreachable backend in plain language", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(new ApiClient("http://api").streamChat(request, handlers())).rejects.toMatchObject({
      status: 0,
      title: "Can't reach the server",
    });
  });
});
